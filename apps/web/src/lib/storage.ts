export function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(`busbuddy:${key}`);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function writeStorage(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(`busbuddy:${key}`, JSON.stringify(value));
  } catch {
  }
}

export function removeStorage(key: string): void {
  try {
    window.localStorage.removeItem(`busbuddy:${key}`);
  } catch {
  }
}
