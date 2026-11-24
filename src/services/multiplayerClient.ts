import type {
  CustomMapBlueprint,
  MultiplayerCarPose,
  PartyActivityMode,
  PartyChatMessage,
  PartyCollisionMode,
  PartyInviteNotification,
  PartyRoomState,
  PartyRoomSummary,
  PartyVisibility,
  WeatherPresetId,
} from '../shared/socialTypes';

export type MultiplayerServerEvent =
  | { type: 'connected'; userId: string; username: string; parties: PartyRoomSummary[] }
  | { type: 'disconnected' }
  | { type: 'error'; message: string }
  | { type: 'party:list'; parties: PartyRoomSummary[] }
  | { type: 'party:state'; room: PartyRoomState }
  | { type: 'party:left' }
  | { type: 'party:member_left'; userId: string }
  | { type: 'party:pose'; pose: MultiplayerCarPose }
  | { type: 'party:chat'; message: PartyChatMessage }
  | { type: 'party:invite'; invite: PartyInviteNotification }
  | { type: 'party:invite_sent'; friendUserId: string };

type EventListener = (event: MultiplayerServerEvent) => void;

export interface CreatePartyPayload {
  name?: string;
  visibility?: PartyVisibility;
  activityMode?: PartyActivityMode;
  collisionMode?: PartyCollisionMode;
  mapId?: string;
  customMapId?: string | null;
  customMapTitle?: string | null;
  customBlueprint?: CustomMapBlueprint | null;
  weatherPreset?: WeatherPresetId;
  solarDeg?: number;
  laps?: number;
  carId?: string;
  paintHex?: string;
}

export interface UpdatePartySettingsPayload {
  name?: string;
  visibility?: PartyVisibility;
  activityMode?: PartyActivityMode;
  collisionMode?: PartyCollisionMode;
  mapId?: string;
  customMapId?: string | null;
  customBlueprint?: CustomMapBlueprint | null;
  weatherPreset?: WeatherPresetId;
  solarDeg?: number;
  laps?: number;
}

class MultiplayerClient {
  private ws: WebSocket | null = null;
  private token: string | null = null;
  private listeners = new Set<EventListener>();
  private reconnectTimer: number | null = null;
  private reconnectAttempts = 0;
  private intentionallyClosed = false;

  public subscribe(listener: EventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(event: MultiplayerServerEvent) {
    this.listeners.forEach((fn) => {
      try {
        fn(event);
      } catch (err) {
        console.error('Multiplayer listener error:', err);
      }
    });
  }

  public isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  public connect(token: string) {
    if (!token) return;
    if (this.token === token && this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    this.disconnect();
    this.token = token;
    this.intentionallyClosed = false;
    this.reconnectAttempts = 0;
    this.openSocket();
  }

  private openSocket() {
    if (!this.token || this.intentionallyClosed) return;
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${proto}//${window.location.host}/ws?token=${encodeURIComponent(this.token)}`;
    const sock = new WebSocket(wsUrl);
    this.ws = sock;

    sock.onopen = () => {
      this.reconnectAttempts = 0;
    };

    sock.onmessage = (evt) => {
      try {
        const msg = JSON.parse(String(evt.data)) as MultiplayerServerEvent;
        this.emit(msg);
      } catch {
        // Ignore malformed packets
      }
    };

    sock.onclose = (evt) => {
      if (this.ws === sock) {
        this.ws = null;
      }
      this.emit({ type: 'disconnected' });
      if (evt.code === 4001) {
        this.token = null;
        return;
      }
      if (!this.intentionallyClosed && this.token) {
        const delay = Math.min(8000, 1000 * Math.pow(1.6, this.reconnectAttempts));
        this.reconnectAttempts += 1;
        this.reconnectTimer = window.setTimeout(() => {
          this.openSocket();
        }, delay);
      }
    };

    sock.onerror = () => {
      // Handled by onclose
    };
  }

  public disconnect() {
    this.intentionallyClosed = true;
    this.token = null;
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      const sock = this.ws;
      this.ws = null;
      try {
        sock.close();
      } catch {
        // Ignore close errors
      }
    }
  }

  private send(type: string, payload: Record<string, unknown> = {}) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ type, payload }));
  }

  public listParties() {
    this.send('party:list');
  }

  public createParty(payload: CreatePartyPayload) {
    this.send('party:create', payload as unknown as Record<string, unknown>);
  }

  public joinParty(payload: {
    code?: string;
    roomId?: string;
    carId?: string;
    paintHex?: string;
  }) {
    this.send('party:join', payload);
  }

  public leaveParty() {
    this.send('party:leave');
  }

  public updatePartySettings(payload: UpdatePartySettingsPayload) {
    this.send('party:update_settings', payload as unknown as Record<string, unknown>);
  }

  public setReady(payload: { ready?: boolean; carId?: string; paintHex?: string }) {
    this.send('party:ready', payload);
  }

  public startParty() {
    this.send('party:start');
  }

  public returnToLobby() {
    this.send('party:return_lobby');
  }

  public sendPose(pose: MultiplayerCarPose) {
    this.send('party:pose', pose as unknown as Record<string, unknown>);
  }

  public reportLapOrFinish(payload: {
    bestLapMs?: number | null;
    driftScore?: number;
    finished?: boolean;
    finishTimeMs?: number;
  }) {
    this.send('party:lap_finish', payload);
  }

  public sendChat(text: string) {
    this.send('party:chat', { text });
  }

  public inviteFriend(friendUserId: string) {
    this.send('party:invite_friend', { friendUserId });
  }

  public challengeFriend(payload: {
    friendUserId: string;
    mapId?: string;
    customMapId?: string | null;
    customBlueprint?: CustomMapBlueprint | null;
    activityMode?: PartyActivityMode;
    weatherPreset?: WeatherPresetId;
    solarDeg?: number;
    laps?: number;
    carId?: string;
    paintHex?: string;
  }) {
    this.send('party:challenge_friend', payload as unknown as Record<string, unknown>);
  }
}

export const multiplayerClient = new MultiplayerClient();
