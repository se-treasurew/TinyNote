export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function normalizeTitle(title: string): string {
  return title.trim().replace(/\s+/g, ' ');
}

export function asBoolean(value: unknown): boolean {
  return value === true || value === 'true' || value === 1 || value === '1';
}
