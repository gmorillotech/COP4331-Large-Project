// API base URL — empty in dev (Vite proxy handles /api), set via VITE_API_BASE_URL in production.
export const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL || '';
