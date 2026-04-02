const LAST_ACTIVITY_KEY = "operador_empilhadeira_last_activity";

export function recordAppActivity(activity: string) {
  try {
    sessionStorage.setItem(LAST_ACTIVITY_KEY, activity);
  } catch {
    // ignore storage failures
  }
}

export function readLastAppActivity() {
  try {
    return sessionStorage.getItem(LAST_ACTIVITY_KEY) || "";
  } catch {
    return "";
  }
}

export function clearAppActivity() {
  try {
    sessionStorage.removeItem(LAST_ACTIVITY_KEY);
  } catch {
    // ignore storage failures
  }
}
