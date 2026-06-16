export function createId(prefix = 'id'): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}_${crypto.randomUUID()}`;
  }

  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function getDeviceId(): string {
  const key = 'tinynote.deviceId';
  const existing = localStorage.getItem(key);
  if (existing) {
    return existing;
  }

  const next = createId('device');
  localStorage.setItem(key, next);
  return next;
}
