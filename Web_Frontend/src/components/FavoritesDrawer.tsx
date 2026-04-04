import { useState, useEffect } from 'react';
import type { MapLocation } from '../types/mapAnnotations';
import './FavoritesDrawer.css';

type FavoritesDrawerProps = {
  locations: MapLocation[];
  isFavorite: (id: string) => boolean;
  onToggleFavorite: (id: string) => void;
  onSelectLocation?: (id: string) => void;
};

function FavoritesDrawer({ locations, isFavorite, onToggleFavorite, onSelectLocation }: FavoritesDrawerProps) {
  const [isOpen, setIsOpen] = useState(false);

  const favoriteLocations = locations.filter((loc) => isFavorite(loc.id));

  return (
    <>
      {/* Floating toggle button */}
      <button
        type="button"
        className="favorites-toggle-btn"
        onClick={() => setIsOpen(true)}
        aria-label="Open favorites"
      >
        ♥
        {favoriteLocations.length > 0 && (
          <span className="favorites-toggle-btn__count">{favoriteLocations.length}</span>
        )}
      </button>

      {/* Overlay */}
      {isOpen && (
        <div className="favorites-overlay" onClick={() => setIsOpen(false)} />
      )}

      {/* Drawer */}
      <div className={`favorites-drawer ${isOpen ? 'open' : ''}`}>
        <div className="favorites-drawer__header">
          <h2>My Favorites</h2>
          <button
            type="button"
            className="favorites-drawer__close"
            onClick={() => setIsOpen(false)}
          >
            ✕
          </button>
        </div>

        <div className="favorites-drawer__body">
          {favoriteLocations.length === 0 ? (
            <div className="favorites-drawer__empty">
              <p>♡</p>
              <p>No favorites yet.</p>
              <p>Tap the heart on any study space to save it here.</p>
            </div>
          ) : (
            <div className="favorites-drawer__list">
              {favoriteLocations.map((loc) => (
                <div key={loc.id} className="favorites-drawer__item">
                  <div
                    className="favorites-drawer__item-info"
                    onClick={() => {
                      onSelectLocation?.(loc.id);
                      setIsOpen(false);
                    }}
                  >
                    <strong>{loc.buildingName ?? loc.title}</strong>
                    {loc.sublocationLabel && (
                      <span>{loc.sublocationLabel}</span>
                    )}
                    {loc.noiseText && (
                      <span className="favorites-drawer__noise">{loc.noiseText}</span>
                    )}
                  </div>
                  <button
                    type="button"
                    className="favorites-drawer__remove"
                    onClick={() => onToggleFavorite(loc.id)}
                    aria-label="Remove from favorites"
                  >
                    ♥
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default FavoritesDrawer;