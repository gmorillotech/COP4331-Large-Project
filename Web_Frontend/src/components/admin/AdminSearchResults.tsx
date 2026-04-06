import type { SearchResultItem } from '../../pages/admin/AdminSearchPage.tsx';

type AdminSearchResultsProps = {
  results: SearchResultItem[];
  selectedId: string | null;
  onSelect: (item: SearchResultItem) => void;
};

function AdminSearchResults({ results, selectedId, onSelect }: AdminSearchResultsProps) {
  if (results.length === 0) {
    return (
      <div className="admin-results-list">
        <p className="admin-results-list__empty">No results</p>
      </div>
    );
  }

  return (
    <div className="admin-results-list">
      {results.map((item) => {
        const isGroup = item.kind === 'group';
        const isSelected = item.id === selectedId;
        const initial = item.name.charAt(0).toUpperCase();

        return (
          <button
            key={item.id}
            type="button"
            className={`admin-result-item${isSelected ? ' is-selected' : ''}`}
            onClick={() => onSelect(item)}
          >
            <div className={`admin-result-item__icon ${isGroup ? 'admin-result-item__icon--group' : 'admin-result-item__icon--location'}`}>
              {initial}
            </div>
            <div className="admin-result-item__body">
              <span className="admin-result-item__name">{item.name}</span>
              <span className={`admin-result-item__type ${isGroup ? 'admin-result-item__type--group' : 'admin-result-item__type--location'}`}>
                {isGroup ? 'Group' : 'Location'}
              </span>
              {!isGroup && item.parentName && (
                <span className="admin-result-item__parent">{item.parentName}</span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}

export default AdminSearchResults;
