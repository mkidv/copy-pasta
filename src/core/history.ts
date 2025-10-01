import { getExtensionContext } from "./ctx";

const HISTORY_KEY = "SauceCode.history.v1";
const SESSION_KEY = "SauceCode.session.v1";
const MAX = 20;

export interface BundleEntry {
  id: string;                // sha256 sur concat parts
  createdAt: number;         // Date.now()
  project: string;
  goal: string;
  files: number;
  bytes: number;
  partsCount: number;
  tokensApprox: number[];
  parts: string[];           // texte complet des parts
}

export interface ActiveSession {
  id: string;
  index: number;             // index de la prochaine part à copier (0-based)
}

function getState<T>(key: string, def: T): T {
  return getExtensionContext().globalState.get<T>(key, def);
}
function setState<T>(key: string, val: T) {
  return getExtensionContext().globalState.update(key, val);
}

export function getHistory(): BundleEntry[] {
  return getState<BundleEntry[]>(HISTORY_KEY, []);
}

export async function pushHistory(entry: BundleEntry) {
  const cur = getHistory();
  const existing = cur.filter(x => x.id !== entry.id);
  existing.unshift(entry);
  if (existing.length > MAX) {existing.length = MAX;}
  await setState(HISTORY_KEY, existing);
}

export function getSession(): ActiveSession | null {
  return getState<ActiveSession | null>(SESSION_KEY, null);
}

export async function setSession(s: ActiveSession | null) {
  await setState(SESSION_KEY, s);
}
