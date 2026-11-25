/**
 * Phase 0 Adversarial Security Spec ("Dirty Dozen") Verification Matrix
 * Documents the 12 payloads that MUST evaluate to PERMISSION_DENIED under firestore.rules.
 */

export interface DirtyDozenCase {
  id: number;
  name: string;
  collectionPath: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  auth: { uid: string; email_verified: boolean } | null;
  payload?: Record<string, unknown>;
  expectedOutcome: 'PERMISSION_DENIED';
}

export const DIRTY_DOZEN_PAYLOADS: DirtyDozenCase[] = [
  {
    id: 1,
    name: 'Unauthenticated get on private user doc',
    collectionPath: 'users/usr_alice',
    operation: 'get',
    auth: null,
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    name: 'Cross-user PII read on /users/{otherUid}',
    collectionPath: 'users/usr_bob',
    operation: 'get',
    auth: { uid: 'usr_alice', email_verified: true },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    name: 'Collection list scraping on /users',
    collectionPath: 'users',
    operation: 'list',
    auth: { uid: 'usr_alice', email_verified: true },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'Unverified email write attempt',
    collectionPath: 'users/usr_alice',
    operation: 'create',
    auth: { uid: 'usr_alice', email_verified: false },
    payload: { uid: 'usr_alice', username: 'alice', email: 'alice@example.com' },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'Shadow field / RBAC privilege escalation (isAdmin: true)',
    collectionPath: 'users/usr_alice',
    operation: 'create',
    auth: { uid: 'usr_alice', email_verified: true },
    payload: {
      uid: 'usr_alice',
      username: 'alice',
      usernameLower: 'alice',
      email: 'alice@example.com',
      displayName: 'Alice',
      authProvider: 'google',
      isAdmin: true,
    },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'Owner UID spoofing on cloud progress',
    collectionPath: 'users/usr_alice/cloudData/progress',
    operation: 'create',
    auth: { uid: 'usr_alice', email_verified: true },
    payload: { ownerId: 'usr_bob', selectedCarId: 'bmw-m4-gt3-evo', creditsCr: 999999 },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'ID poisoning with oversized / malformed map ID',
    collectionPath: `users/usr_alice/draftMaps/${'a'.repeat(160)}`,
    operation: 'create',
    auth: { uid: 'usr_alice', email_verified: true },
    payload: { id: 'a'.repeat(160), authorId: 'usr_alice' },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'Forged historical timestamp on create',
    collectionPath: 'users/usr_alice/cloudData/progress',
    operation: 'create',
    auth: { uid: 'usr_alice', email_verified: true },
    payload: { ownerId: 'usr_alice', createdAt: new Date('2020-01-01T00:00:00Z') },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'Immutable createdAt / ownerId tampering on update',
    collectionPath: 'users/usr_alice/cloudData/progress',
    operation: 'update',
    auth: { uid: 'usr_alice', email_verified: true },
    payload: { ownerId: 'usr_mallory', createdAt: new Date('2021-01-01T00:00:00Z') },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'Negative credits & oversized carId value poisoning',
    collectionPath: 'users/usr_alice/cloudData/progress',
    operation: 'update',
    auth: { uid: 'usr_alice', email_verified: true },
    payload: { creditsCr: -500, selectedCarId: 'x'.repeat(200) },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'Unbounded array DoS on CustomMapDoc controlPoints (>400)',
    collectionPath: 'users/usr_alice/draftMaps/map_1',
    operation: 'create',
    auth: { uid: 'usr_alice', email_verified: true },
    payload: { id: 'map_1', authorId: 'usr_alice', controlPoints: new Array(500).fill({ x: 0, y: 0, z: 0 }) },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'Hijack or unpublished write on /publicMaps/{mapId}',
    collectionPath: 'publicMaps/map_bob_1',
    operation: 'update',
    auth: { uid: 'usr_alice', email_verified: true },
    payload: { title: 'Hijacked', isPublished: false },
    expectedOutcome: 'PERMISSION_DENIED',
  },
];
