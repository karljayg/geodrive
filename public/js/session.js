// The current trip, kept in this browser's localStorage so a refresh carries on where it left off.
const STORE = 'geodrive_session_v1';

export function saveSession(state) {
  try {
    localStorage.setItem(STORE, JSON.stringify(state));
  } catch (err) {
    console.warn('saving trip:', err);
  }
}

// The saved trip, or null if there isn't a usable one.
export function loadSession() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE));
    return s && Number.isFinite(s.pos?.lat) && Number.isFinite(s.pos?.lng) && Number.isFinite(s.heading) ? s : null;
  } catch (err) {
    console.warn('saved trip:', err);
    return null;
  }
}
