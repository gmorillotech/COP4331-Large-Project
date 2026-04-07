import { useState, useCallback } from 'react';
import { apiUrl } from './config';

function getFavoritesFromStorage(): string[] {
  try {
    const stored = localStorage.getItem('user_data');
    if (!stored) return [];
    const user = JSON.parse(stored);
    return Array.isArray(user.favorites) ? user.favorites : [];
  } catch {
    return [];
  }
}

async function saveFavoritesToServer(favorites: string[]): Promise<void> {
  const token = localStorage.getItem('token');
  if (!token) return;

  await fetch(apiUrl('/api/auth/profile'), {
    method: 'PUT',
    body: JSON.stringify({ favorites }),
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });

  // Update localStorage to keep it in sync
  const stored = localStorage.getItem('user_data');
  if (stored) {
    const user = JSON.parse(stored);
    user.favorites = favorites;
    localStorage.setItem('user_data', JSON.stringify(user));
    window.dispatchEvent(new Event('storage'));
  }
}

export function useFavorites() {
  const [favorites, setFavorites] = useState<string[]>(getFavoritesFromStorage);

  const isFavorite = useCallback(
    (id: string) => favorites.includes(id),
    [favorites]
  );

  const toggleFavorite = useCallback(
    async (id: string) => {
      const updated = favorites.includes(id)
        ? favorites.filter((f) => f !== id)
        : [...favorites, id];

      setFavorites(updated);
      await saveFavoritesToServer(updated);
    },
    [favorites]
  );

  return { favorites, isFavorite, toggleFavorite };
}
