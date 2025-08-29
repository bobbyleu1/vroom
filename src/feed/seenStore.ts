import AsyncStorage from '@react-native-async-storage/async-storage';
import { SEEN_TTL_DAYS, MAX_POOL } from './constants';

const KEY = 'feed_seen_v1';

type SeenEntry = { id: string; ts: number };
type SeenState = { entries: SeenEntry[] };

export async function loadSeen(): Promise<SeenState> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const parsed: SeenState = raw ? JSON.parse(raw) : { entries: [] };
    const cutoff = Date.now() - (SEEN_TTL_DAYS * 24 * 60 * 60 * 1000);
    parsed.entries = parsed.entries.filter(e => e.ts >= cutoff);
    return parsed;
  } catch { 
    return { entries: [] }; 
  }
}

export async function saveSeen(state: SeenState) {
  try { 
    await AsyncStorage.setItem(KEY, JSON.stringify(state)); 
  } catch {}
}

export function rememberSeen(state: SeenState, id: string) {
  state.entries.push({ id, ts: Date.now() });
  if (state.entries.length > MAX_POOL * 2) {
    state.entries = state.entries.slice(-MAX_POOL);
  }
}

export async function clearSeen() {
  try {
    await AsyncStorage.removeItem(KEY);
    console.log('Cleared seen cache');
  } catch (e) {
    console.error('Failed to clear seen cache:', e);
  }
}