import { useState } from 'react';
import { createPortal } from 'react-dom';
import type { MapLocation } from '../types/mapAnnotations';
import { formatLocationHeading } from '../lib/mapUtils';
import './FavoritesDrawer.css';

type FavoritesDrawerProps = {
  locations: MapLocation[];
  isFavorite: (id: string) => boolean;
  onToggleFavorite: (id: string) => void;
  onSelectLocation?: (id: string) => void;
  // External control — when provided the drawer is fully controlled from outside
  isOpen?: boolean;
  onClose?: () => void;
};

function FavoritesDrawer({
  locations,
  isFavorite,
  onToggleFavorite,
  onSelectLocation,
  isOpen: externalOpen,
  onClose: externalClose,
}: FavoritesDrawerProps) {
  const [internalOpen, setInternalOpen] = useState(false);

  // If external props are provided, use them; otherwise manage state internally
  const controlled = externalOpen !== undefined;
  const isOpen  = controlled ? (externalOpen ?? false) : internalOpen;
  const onClose = controlled ? (externalClose ?? (() => {})) : () => setInternalOpen(false);

  const favoriteLocations = locations.filter((loc) => isFavorite(loc.id));

  // Portal to document.body so no ancestor overflow:hidden / transform can clip it
  return createPortal(
    <>
      {/* Overlay */}
      {isOpen && (
        <div className="favorites-overlay" onClick={onClose} />
      )}

      {/* Drawer — slides from the RIGHT */}
      <div className={`favorites-drawer ${isOpen ? 'open' : ''}`}>
        <div className="favorites-drawer__header">
          <h2>My Favorites</h2>
          <button
            type="button"
            className="favorites-drawer__close"
            onClick={onClose}
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
                      onClose();
                    }}
                  >
                    <strong>{formatLocationHeading(loc)}</strong>
                    {loc.sublocationLabel && (
                      <span className="favorites-drawer__sub">{loc.sublocationLabel}</span>
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
    </>,
    document.body
  );
}

export default FavoritesDrawer;
