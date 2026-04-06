import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './RedrawMerge.css';

type LocationGroup = {
  _id: string;
  name: string;
  latitude: number;
  longitude: number;
};

type GroupSelectorProps = {
  groups: LocationGroup[];
  selectedIds: string[];
  onToggle: (id: string) => void;
};

function GroupSelector({ groups, selectedIds, onToggle }: GroupSelectorProps) {
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
          const isSelected = selectedIds.includes(group._id);
          return (
            <li
              key={group._id}
              className={`group-selector__item${isSelected ? ' is-selected' : ''}`}
              onClick={() => onToggle(group._id)}
            >
              <div className="group-selector__checkbox">
                {isSelected && <span className="group-selector__checkmark">&#10003;</span>}
              </div>
              <div className="group-selector__info">
                <div className="group-selector__name">{group.name}</div>
                <div className="group-selector__id">{group._id}</div>
              </div>
              <button
                type="button"
                className="group-selector__redraw-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/admin/redraw/${group._id}`);
                }}
              >
                Redraw
              </button>
            </li>
          );
        })}
        {filtered.length === 0 && (
          <li style={{ padding: '20px', textAlign: 'center', color: '#999', fontSize: '0.9em' }}>
            No groups match your filter.
          </li>
        )}
      </ul>
    </div>
  );
}

export default GroupSelector;
