import crypto from 'crypto';
import type { WebSocket, WebSocketServer } from 'ws';
import type {
  AuthUser,
  CustomMapBlueprint,
  MultiplayerCarPose,
  PartyActivityMode,
  PartyChatMessage,
  PartyCollisionMode,
  PartyInviteNotification,
  PartyMemberState,
  PartyRoomState,
  PartyRoomSummary,
  PartyVisibility,
  WeatherPresetId,
} from '../src/shared/socialTypes';
import { getCustomMapById, getFriendIds, getUserByToken, incrementMapPlay } from './db';

interface ClientConnection {
  ws: WebSocket;
  user: AuthUser;
  roomId: string | null;
}

interface InternalRoom {
  id: string;
  code: string;
  name: string;
  hostUserId: string;
  hostUsername: string;
  visibility: PartyVisibility;
  activityMode: PartyActivityMode;
  collisionMode: PartyCollisionMode;
  mapId: string;
  customMapId: string | null;
  customMapTitle: string | null;
  customBlueprint: CustomMapBlueprint | null;
  weatherPreset: WeatherPresetId;
  solarDeg: number;
  laps: number;
  status: 'lobby' | 'countdown' | 'active' | 'finished';
  countdownEndsAt: number;
  members: Map<string, PartyMemberState>;
  chat: PartyChatMessage[];
  maxMembers: number;
}

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export class PartyManager {
  private connections = new Map<WebSocket, ClientConnection>();
  private userSockets = new Map<string, Set<WebSocket>>();
  private rooms = new Map<string, InternalRoom>();
  private roomsByCode = new Map<string, string>();
  private countdownTimer: NodeJS.Timeout | null = null;

  constructor(private wss: WebSocketServer) {
    this.wss.on('connection', (ws, req) => {
      try {
        const url = new URL(req.url ?? '/', 'http://localhost');
        const token = url.searchParams.get('token');
        const user = getUserByToken(token);
        if (!user) {
          ws.send(JSON.stringify({ type: 'error', message: 'Authentication required for multiplayer.' }));
          ws.close(4001, 'Unauthorized');
          return;
        }
        this.registerConnection(ws, user);
      } catch {
        ws.close(4000, 'Connection error');
      }
    });

    this.countdownTimer = setInterval(() => {
      this.tickCountdowns();
    }, 250);
  }

  public dispose() {
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
  }

  public getUserPresence(userId: string): {
    online: boolean;
    partyCode: string | null;
    partyName: string | null;
  } {
    const sockets = this.userSockets.get(userId);
    if (!sockets || sockets.size === 0) {
      return { online: false, partyCode: null, partyName: null };
    }
    for (const ws of sockets) {
      const conn = this.connections.get(ws);
      if (conn?.roomId) {
        const room = this.rooms.get(conn.roomId);
        if (room) {
          return { online: true, partyCode: room.code, partyName: room.name };
        }
      }
    }
    return { online: true, partyCode: null, partyName: null };
  }

  public listVisibleRooms(viewerUserId?: string | null): PartyRoomSummary[] {
    const viewerFriends = viewerUserId ? new Set(getFriendIds(viewerUserId)) : new Set<string>();
    const out: PartyRoomSummary[] = [];
    for (const room of this.rooms.values()) {
      if (room.visibility === 'private') continue;
      if (
        room.visibility === 'friends' &&
        viewerUserId !== room.hostUserId &&
        !viewerFriends.has(room.hostUserId)
      ) {
        continue;
      }
      out.push(this.toSummary(room));
    }
    return out;
  }

  private registerConnection(ws: WebSocket, user: AuthUser) {
    const conn: ClientConnection = { ws, user, roomId: null };
    this.connections.set(ws, conn);
    let set = this.userSockets.get(user.id);
    if (!set) {
      set = new Set();
      this.userSockets.set(user.id, set);
    }
    set.add(ws);

    this.sendToSocket(ws, {
      type: 'connected',
      userId: user.id,
      username: user.username,
      parties: this.listVisibleRooms(user.id),
    });

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(String(raw)) as { type: string; payload?: Record<string, unknown> };
        this.handleMessage(conn, msg.type, msg.payload ?? {});
      } catch {
        // Ignore malformed packets
      }
    });

    ws.on('close', () => {
      this.handleDisconnect(conn);
    });
  }

  private handleDisconnect(conn: ClientConnection) {
    if (conn.roomId) {
      this.leaveRoom(conn);
    }
    this.connections.delete(conn.ws);
    const set = this.userSockets.get(conn.user.id);
    if (set) {
      set.delete(conn.ws);
      if (set.size === 0) {
        this.userSockets.delete(conn.user.id);
      }
    }
  }

  private handleMessage(conn: ClientConnection, type: string, payload: Record<string, unknown>) {
    switch (type) {
      case 'party:list': {
        this.sendToSocket(conn.ws, {
          type: 'party:list',
          parties: this.listVisibleRooms(conn.user.id),
        });
        break;
      }
      case 'party:create': {
        this.createRoom(conn, payload);
        break;
      }
      case 'party:join': {
        this.joinRoom(conn, payload);
        break;
      }
      case 'party:leave': {
        this.leaveRoom(conn);
        break;
      }
      case 'party:update_settings': {
        this.updateRoomSettings(conn, payload);
        break;
      }
      case 'party:ready': {
        this.toggleReady(conn, payload);
        break;
      }
      case 'party:start': {
        this.startSession(conn);
        break;
      }
      case 'party:return_lobby': {
        this.returnToLobby(conn);
        break;
      }
      case 'party:pose': {
        this.relayPose(conn, payload as unknown as MultiplayerCarPose);
        break;
      }
      case 'party:lap_finish': {
        this.handleLapOrFinish(conn, payload);
        break;
      }
      case 'party:chat': {
        this.handleChat(conn, String(payload.text ?? ''));
        break;
      }
      case 'party:invite_friend': {
        this.handleInviteFriend(conn, String(payload.friendUserId ?? ''));
        break;
      }
      case 'party:challenge_friend': {
        this.handleChallengeFriend(conn, payload);
        break;
      }
    }
  }

  private createRoom(conn: ClientConnection, payload: Record<string, unknown>) {
    if (conn.roomId) {
      this.leaveRoom(conn);
    }
    let code = generateRoomCode();
    while (this.roomsByCode.has(code)) {
      code = generateRoomCode();
    }
    const id = `room_${crypto.randomUUID()}`;
    const customMapId = typeof payload.customMapId === 'string' ? payload.customMapId : null;
    let customBlueprint: CustomMapBlueprint | null =
      (payload.customBlueprint as CustomMapBlueprint | null) ?? null;
    if (customMapId && !customBlueprint) {
      customBlueprint = getCustomMapById(customMapId, conn.user.id);
    }

    const room: InternalRoom = {
      id,
      code,
      name: String(payload.name ?? `${conn.user.username}'s Room`).trim().slice(0, 40) || `${conn.user.username}'s Room`,
      hostUserId: conn.user.id,
      hostUsername: conn.user.username,
      visibility: (payload.visibility as PartyVisibility) || 'public',
      activityMode: (payload.activityMode as PartyActivityMode) || 'race',
      collisionMode: (payload.collisionMode as PartyCollisionMode) || 'ghost',
      mapId: String(payload.mapId || 'aurelia_ridge'),
      customMapId: customBlueprint?.id ?? customMapId,
      customMapTitle: customBlueprint?.title ?? (typeof payload.customMapTitle === 'string' ? payload.customMapTitle : null),
      customBlueprint,
      weatherPreset: (payload.weatherPreset as WeatherPresetId) || 'dry',
      solarDeg: Number(payload.solarDeg ?? 30),
      laps: Math.max(0, Math.min(999, Math.round(Number(payload.laps ?? 3)) || 0)),
      status: 'lobby',
      countdownEndsAt: 0,
      members: new Map(),
      chat: [],
      maxMembers: 12,
    };

    const carId = String(payload.carId || 'audi-r8-lms-evo');
    const paintHex = String(payload.paintHex || '#f59e0b');
    room.members.set(conn.user.id, {
      userId: conn.user.id,
      username: conn.user.username,
      carId,
      paintHex,
      ready: true,
      isHost: true,
      lap: 1,
      trackT: 0,
      totalProgress: 0,
      bestLapMs: null,
      driftScore: 0,
      finished: false,
      finishTimeMs: null,
    });
    room.chat.push({
      id: `sys_${Date.now()}`,
      userId: 'system',
      username: 'Race Control',
      text: `${conn.user.username} opened party ${code}.`,
      timestamp: Date.now(),
      isSystem: true,
    });

    this.rooms.set(id, room);
    this.roomsByCode.set(code, id);
    conn.roomId = id;
    this.broadcastRoomState(room);
    this.broadcastRoomList();
  }

  private joinRoom(conn: ClientConnection, payload: Record<string, unknown>) {
    const code = String(payload.code ?? '').trim().toUpperCase();
    const roomIdParam = typeof payload.roomId === 'string' ? payload.roomId : '';
    const resolvedId = roomIdParam || this.roomsByCode.get(code) || '';
    const room = this.rooms.get(resolvedId);
    if (!room) {
      this.sendToSocket(conn.ws, { type: 'error', message: 'Party room not found or already closed.' });
      return;
    }
    if (room.members.size >= room.maxMembers && !room.members.has(conn.user.id)) {
      this.sendToSocket(conn.ws, { type: 'error', message: 'Party room is full.' });
      return;
    }
    if (conn.roomId && conn.roomId !== room.id) {
      this.leaveRoom(conn);
    }
    conn.roomId = room.id;
    const carId = String(payload.carId || 'audi-r8-lms-evo');
    const paintHex = String(payload.paintHex || '#06b6d4');
    room.members.set(conn.user.id, {
      userId: conn.user.id,
      username: conn.user.username,
      carId,
      paintHex,
      ready: true,
      isHost: room.hostUserId === conn.user.id,
      lap: 1,
      trackT: 0,
      totalProgress: 0,
      bestLapMs: null,
      driftScore: 0,
      finished: false,
      finishTimeMs: null,
    });
    room.chat.push({
      id: `sys_${Date.now()}_${Math.random()}`,
      userId: 'system',
      username: 'Race Control',
      text: `${conn.user.username} joined the room.`,
      timestamp: Date.now(),
      isSystem: true,
    });
    if (room.chat.length > 50) room.chat.shift();
    this.broadcastRoomState(room);
    this.broadcastRoomList();
  }

  private leaveRoom(conn: ClientConnection) {
    if (!conn.roomId) return;
    const room = this.rooms.get(conn.roomId);
    conn.roomId = null;
    if (!room) return;
    room.members.delete(conn.user.id);
    this.sendToSocket(conn.ws, { type: 'party:left' });

    if (room.members.size === 0) {
      this.rooms.delete(room.id);
      this.roomsByCode.delete(room.code);
      this.broadcastRoomList();
      return;
    }

    if (room.hostUserId === conn.user.id) {
      const nextHost = room.members.values().next().value;
      if (nextHost) {
        room.hostUserId = nextHost.userId;
        room.hostUsername = nextHost.username;
        nextHost.isHost = true;
      }
    }

    room.chat.push({
      id: `sys_${Date.now()}_${Math.random()}`,
      userId: 'system',
      username: 'Race Control',
      text: `${conn.user.username} left the room.`,
      timestamp: Date.now(),
      isSystem: true,
    });
    if (room.chat.length > 50) room.chat.shift();

    this.broadcastToRoom(room, {
      type: 'party:member_left',
      userId: conn.user.id,
    });
    this.broadcastRoomState(room);
    this.broadcastRoomList();
  }

  private updateRoomSettings(conn: ClientConnection, payload: Record<string, unknown>) {
    if (!conn.roomId) return;
    const room = this.rooms.get(conn.roomId);
    if (!room || room.hostUserId !== conn.user.id) return;

    if (typeof payload.name === 'string' && payload.name.trim()) {
      room.name = payload.name.trim().slice(0, 40);
    }
    if (payload.visibility) room.visibility = payload.visibility as PartyVisibility;
    if (payload.activityMode) room.activityMode = payload.activityMode as PartyActivityMode;
    if (payload.collisionMode) room.collisionMode = payload.collisionMode as PartyCollisionMode;
    if (typeof payload.mapId === 'string') room.mapId = payload.mapId;
    if (payload.customMapId !== undefined) {
      room.customMapId = payload.customMapId ? String(payload.customMapId) : null;
      if (room.customMapId) {
        room.customBlueprint =
          (payload.customBlueprint as CustomMapBlueprint | null) ??
          getCustomMapById(room.customMapId, conn.user.id);
        room.customMapTitle = room.customBlueprint?.title ?? null;
      } else {
        room.customBlueprint = null;
        room.customMapTitle = null;
      }
    }
    if (payload.weatherPreset) room.weatherPreset = payload.weatherPreset as WeatherPresetId;
    if (typeof payload.solarDeg === 'number') room.solarDeg = payload.solarDeg;
    if (typeof payload.laps === 'number') {
      room.laps = Math.max(0, Math.min(999, Math.round(payload.laps) || 0));
    }

    this.broadcastRoomState(room);
    this.broadcastRoomList();
  }

  private toggleReady(conn: ClientConnection, payload: Record<string, unknown>) {
    if (!conn.roomId) return;
    const room = this.rooms.get(conn.roomId);
    if (!room) return;
    const member = room.members.get(conn.user.id);
    if (!member) return;
    if (typeof payload.ready === 'boolean') member.ready = payload.ready;
    if (typeof payload.carId === 'string') member.carId = payload.carId;
    if (typeof payload.paintHex === 'string') member.paintHex = payload.paintHex;
    this.broadcastRoomState(room);
  }

  private startSession(conn: ClientConnection) {
    if (!conn.roomId) return;
    const room = this.rooms.get(conn.roomId);
    if (!room || room.hostUserId !== conn.user.id) return;

    for (const m of room.members.values()) {
      m.lap = 1;
      m.trackT = 0;
      m.totalProgress = 0;
      m.finished = false;
      m.finishTimeMs = null;
    }

    if (room.customMapId) {
      incrementMapPlay(room.customMapId);
    }

    if (room.activityMode === 'explore') {
      room.status = 'active';
      room.countdownEndsAt = 0;
    } else {
      room.status = 'countdown';
      room.countdownEndsAt = Date.now() + 3000;
    }
    this.broadcastRoomState(room);
    this.broadcastRoomList();
  }

  private returnToLobby(conn: ClientConnection) {
    if (!conn.roomId) return;
    const room = this.rooms.get(conn.roomId);
    if (!room || room.hostUserId !== conn.user.id) return;
    room.status = 'lobby';
    room.countdownEndsAt = 0;
    this.broadcastRoomState(room);
    this.broadcastRoomList();
  }

  private tickCountdowns() {
    const now = Date.now();
    for (const room of this.rooms.values()) {
      if (room.status === 'countdown') {
        if (now >= room.countdownEndsAt) {
          room.status = 'active';
          room.countdownEndsAt = 0;
        }
        this.broadcastRoomState(room);
      }
    }
  }

  private relayPose(conn: ClientConnection, pose: MultiplayerCarPose) {
    if (!conn.roomId) return;
    const room = this.rooms.get(conn.roomId);
    if (!room) return;
    const member = room.members.get(conn.user.id);
    if (member) {
      member.carId = pose.carId || member.carId;
      member.paintHex = pose.paintHex || member.paintHex;
      member.lap = pose.lap;
      member.trackT = pose.trackT;
      member.totalProgress = pose.totalProgress;
      member.bestLapMs = pose.bestLapMs;
      member.driftScore = pose.driftScore;
      member.tandemPartnerId = pose.tandemPartnerId ?? null;
      member.tandemPartnerUsername = pose.tandemPartnerUsername ?? null;
      member.tandemMultiplier = pose.tandemMultiplier ?? 1;
    }

    const packet: MultiplayerCarPose = {
      ...pose,
      userId: conn.user.id,
      username: conn.user.username,
      timestamp: Date.now(),
    };
    this.broadcastToRoom(room, { type: 'party:pose', pose: packet }, conn.ws);
  }

  private handleLapOrFinish(conn: ClientConnection, payload: Record<string, unknown>) {
    if (!conn.roomId) return;
    const room = this.rooms.get(conn.roomId);
    if (!room) return;
    const member = room.members.get(conn.user.id);
    if (!member) return;
    if (typeof payload.bestLapMs === 'number') {
      member.bestLapMs =
        member.bestLapMs === null ? payload.bestLapMs : Math.min(member.bestLapMs, payload.bestLapMs);
    }
    if (typeof payload.driftScore === 'number') {
      member.driftScore = Math.max(member.driftScore, payload.driftScore);
    }
    if (payload.finished) {
      member.finished = true;
      member.finishTimeMs = Number(payload.finishTimeMs ?? 0);
      room.chat.push({
        id: `sys_${Date.now()}_${Math.random()}`,
        userId: 'system',
        username: 'Race Control',
        text: `${conn.user.username} crossed the finish line!`,
        timestamp: Date.now(),
        isSystem: true,
      });
      if (room.chat.length > 50) room.chat.shift();
    }
    this.broadcastRoomState(room);
  }

  private handleChat(conn: ClientConnection, rawText: string) {
    if (!conn.roomId) return;
    const room = this.rooms.get(conn.roomId);
    if (!room) return;
    const text = rawText.trim().slice(0, 200);
    if (!text) return;
    const msg: PartyChatMessage = {
      id: `chat_${Date.now()}_${Math.random()}`,
      userId: conn.user.id,
      username: conn.user.username,
      text,
      timestamp: Date.now(),
    };
    room.chat.push(msg);
    if (room.chat.length > 50) room.chat.shift();
    this.broadcastToRoom(room, { type: 'party:chat', message: msg });
  }

  private handleInviteFriend(conn: ClientConnection, friendUserId: string) {
    if (!conn.roomId) return;
    const room = this.rooms.get(conn.roomId);
    if (!room) return;
    const targetSockets = this.userSockets.get(friendUserId);
    if (!targetSockets || targetSockets.size === 0) {
      this.sendToSocket(conn.ws, {
        type: 'error',
        message: 'Friend is currently offline.',
      });
      return;
    }
    const now = Date.now();
    const invite: PartyInviteNotification = {
      id: `inv_${now}_${Math.random()}`,
      fromUserId: conn.user.id,
      fromUsername: conn.user.username,
      roomId: room.id,
      roomCode: room.code,
      roomName: room.name,
      activityMode: room.activityMode,
      mapId: room.mapId,
      mapTitle: room.customMapTitle || room.mapId,
      mapType: room.customBlueprint?.mapType,
      difficulty: room.customBlueprint?.difficulty,
      isDirectChallenge: true,
      expiresAt: now + 30000,
      createdAt: now,
    };
    for (const sock of targetSockets) {
      this.sendToSocket(sock, { type: 'party:invite', invite });
    }
    this.sendToSocket(conn.ws, {
      type: 'party:invite_sent',
      friendUserId,
    });
  }

  private handleChallengeFriend(conn: ClientConnection, payload: Record<string, unknown>) {
    const friendUserId = String(payload.friendUserId ?? '');
    if (!friendUserId) return;
    const targetSockets = this.userSockets.get(friendUserId);
    if (!targetSockets || targetSockets.size === 0) {
      this.sendToSocket(conn.ws, {
        type: 'error',
        message: 'Friend is currently offline.',
      });
      return;
    }
    if (!conn.roomId || !this.rooms.get(conn.roomId)) {
      this.createRoom(conn, {
        name: `${conn.user.username} Challenge`,
        visibility: 'friends',
        activityMode: payload.activityMode ?? 'race',
        collisionMode: 'ghost',
        mapId: payload.mapId ?? 'aurelia_ridge',
        customMapId: payload.customMapId ?? null,
        customBlueprint: payload.customBlueprint ?? null,
        weatherPreset: payload.weatherPreset ?? 'dry',
        solarDeg: payload.solarDeg ?? 30,
        laps: payload.laps ?? 2,
        carId: payload.carId,
        paintHex: payload.paintHex,
      });
    }
    this.handleInviteFriend(conn, friendUserId);
  }

  private toSummary(room: InternalRoom): PartyRoomSummary {
    return {
      id: room.id,
      code: room.code,
      name: room.name,
      hostUserId: room.hostUserId,
      hostUsername: room.hostUsername,
      visibility: room.visibility,
      activityMode: room.activityMode,
      collisionMode: room.collisionMode,
      mapId: room.mapId,
      customMapId: room.customMapId,
      customMapTitle: room.customMapTitle,
      weatherPreset: room.weatherPreset,
      solarDeg: room.solarDeg,
      laps: room.laps,
      status: room.status,
      memberCount: room.members.size,
      maxMembers: room.maxMembers,
    };
  }

  private toState(room: InternalRoom): PartyRoomState {
    return {
      ...this.toSummary(room),
      customBlueprint: room.customBlueprint,
      countdownRemainingSec:
        room.status === 'countdown'
          ? Math.max(0, (room.countdownEndsAt - Date.now()) / 1000)
          : 0,
      members: Array.from(room.members.values()),
      chat: room.chat,
    };
  }

  private broadcastRoomState(room: InternalRoom) {
    this.broadcastToRoom(room, { type: 'party:state', room: this.toState(room) });
  }

  private broadcastRoomList() {
    for (const conn of this.connections.values()) {
      this.sendToSocket(conn.ws, {
        type: 'party:list',
        parties: this.listVisibleRooms(conn.user.id),
      });
    }
  }

  private broadcastToRoom(room: InternalRoom, data: unknown, excludeWs?: WebSocket) {
    const raw = JSON.stringify(data);
    for (const conn of this.connections.values()) {
      if (conn.roomId === room.id && conn.ws !== excludeWs && conn.ws.readyState === 1) {
        conn.ws.send(raw);
      }
    }
  }

  private sendToSocket(ws: WebSocket, data: unknown) {
    if (ws.readyState === 1) {
      ws.send(JSON.stringify(data));
    }
  }
}
