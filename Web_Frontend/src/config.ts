// API base URL — empty in dev (Vite proxy handles /api), set via VITE_API_BASE_URL in production.
import { API_BASE_URL } from './config/active';

export { API_BASE_URL };

export function apiUrl(path: string): string {
  return `${API_BASE_URL}${path}`;
}
