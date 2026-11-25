import { getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth, type DecodedIdToken } from 'firebase-admin/auth';
import firebaseConfig from '../firebase-applet-config.json';

function getConfiguredProjectId(): string | null {
  const pid = typeof firebaseConfig?.projectId === 'string' ? firebaseConfig.projectId.trim() : '';
  if (!pid || pid === 'remixed-project-id') {
    return null;
  }
  return pid;
}

export function isFirebaseTokenVerifierReady(): boolean {
  return getConfiguredProjectId() !== null;
}

function ensureFirebaseAdminApp() {
  const projectId = getConfiguredProjectId();
  if (!projectId) {
    throw new Error('Firebase project is not provisioned.');
  }
  return getApps().length ? getApp() : initializeApp({ projectId });
}

export async function verifyFirebaseIdToken(idToken: string): Promise<DecodedIdToken> {
  const trimmed = String(idToken ?? '').trim();
  if (!trimmed) {
    throw new Error('Missing Firebase ID token.');
  }
  const adminApp = ensureFirebaseAdminApp();
  return getAuth(adminApp).verifyIdToken(trimmed);
}
