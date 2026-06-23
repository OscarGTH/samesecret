export const API_BASE = import.meta.env.VITE_API_URL ?? '';

export function api(path: string) {
  if (!API_BASE) return path;
  // ensure no double slash
  return `${API_BASE.replace(/\/$/, '')}${path}`;
}
