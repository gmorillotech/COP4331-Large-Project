import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './RedrawMerge.css';

type LocationGroup = {
  locationGroupId: string;
  name: string;
  centerLatitude: number | null;
  centerLongitude: number | null;
};

type GroupSelectorProps = {
  groups: LocationGroup[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  onDelete?: (group: LocationGroup) => void;
  deletingGroupId?: string | null;
};

function GroupSelector({ groups, selectedIds, onToggle, onDelete, deletingGroupId }: GroupSelectorProps) {
  const navigate = useNavigate();
  const [filter, setFilter] = useState('');

  const filtered = groups.filter((g) =>
    g.name.toLowerCase().includes(filter.toLowerCase()),
  );

  return (
    <div className="group-selector">
      <div className="group-selector__search">
        <input
          type="text"
          className="group-selector__search-input"
          placeholder="Filter groups..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          aria-label="Filter groups"
        />
      </div>
      <ul className="group-selector__list">
        {filtered.map((group) => {
          const isSelected = selectedIds.includes(group.locationGroupId);
          const isDeleting = deletingGroupId === group.locationGroupId;
          return (
            <li
              key={group.locationGroupId}
              className={`group-selector__item${isSelected ? ' is-selected' : ''}`}
              onClick={() => onToggle(group.locationGroupId)}
            >
              <div className="group-selector__item-top">
                <div className="group-selector__checkbox">
                  {isSelected && <span className="group-selector__checkmark">&#10003;</span>}
                </div>
                <div className="group-selector__info">
                  <div className="group-selector__name">{group.name}</div>
                  <div className="group-selector__id">{group.locationGroupId}</div>
                </div>
              </div>
              <div className="group-selector__item-actions">
                <button
                  type="button"
                  className="group-selector__redraw-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/admin/redraw/${group.locationGroupId}`);
                  }}
                >
                  Redraw
                </button>
                <button
                  type="button"
                  className="group-selector__split-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/admin/split/${group.locationGroupId}`);
                  }}
                >
                  Split
                </button>
                {onDelete && (
                  <button
                    type="button"
                    className="group-selector__delete-btn"
                    disabled={isDeleting}
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(group);
                    }}
                  >
                    {isDeleting ? '...' : 'Delete'}
                  </button>
                )}
              </div>
            </li>
          );
        })}
        {filtered.length === 0 && (
          <li style={{ padding: '20px', textAlign: 'center', color: '#999', fontSize: '0.9em' }}>
            {groups.length === 0 && filter.trim().length === 0
              ? 'No groups available.'
              : 'No groups match your filter.'}
          </li>
        )}
      </ul>
    </div>
  );
}

export default GroupSelector;
