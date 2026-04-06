import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './RedrawMerge.css';

type GroupInfo = {
  _id: string;
  name: string;
};

type MergeDialogProps = {
  group1: GroupInfo;
  group2: GroupInfo;
  onConfirm: () => void;
  onCancel: () => void;
};

type NameOption = 'custom' | 'group1' | 'group2';

function MergeDialog({ group1, group2, onConfirm, onCancel }: MergeDialogProps) {
  const navigate = useNavigate();
  const [nameOption, setNameOption] = useState<NameOption>('group1');
  const [customName, setCustomName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const destinationName =
    nameOption === 'group1'
      ? group1.name
      : nameOption === 'group2'
        ? group2.name
        : customName.trim();

  const canConfirm = destinationName.length > 0 && !isLoading;

  async function handleConfirm() {
    setIsLoading(true);
    setError(null);

    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/admin/location-groups/merge', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          sourceGroupIds: [group1._id, group2._id],
          destinationName,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? 'Merge failed.');
        return;
      }

      onConfirm();

      if (data.requiresRedraw && data.newGroupId) {
        navigate(`/admin/redraw/${data.newGroupId}`);
      } else {
        navigate('/admin/locations');
        window.location.reload();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reach the server.');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="merge-dialog-overlay" onClick={onCancel}>
      <div className="merge-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="merge-dialog__header">
          <h3>Merge Groups</h3>
        </div>

        <div className="merge-dialog__body">
          <div className="merge-dialog__group-info">
            <p className="merge-dialog__group-label">Source Group 1</p>
            <p className="merge-dialog__group-name">{group1.name}</p>
            <p className="merge-dialog__group-id">{group1._id}</p>
          </div>

          <div className="merge-dialog__group-info">
            <p className="merge-dialog__group-label">Source Group 2</p>
            <p className="merge-dialog__group-name">{group2.name}</p>
            <p className="merge-dialog__group-id">{group2._id}</p>
          </div>

          <div className="merge-dialog__name-section">
            <h4>Destination Name</h4>
            <div className="merge-dialog__radio-group">
              <div className="merge-dialog__radio-option">
                <input
                  type="radio"
                  id="merge-name-group1"
                  name="mergeName"
                  checked={nameOption === 'group1'}
                  onChange={() => setNameOption('group1')}
                />
                <label htmlFor="merge-name-group1">
                  Inherit &quot;{group1.name}&quot;
                </label>
              </div>

              <div className="merge-dialog__radio-option">
                <input
                  type="radio"
                  id="merge-name-group2"
                  name="mergeName"
                  checked={nameOption === 'group2'}
                  onChange={() => setNameOption('group2')}
                />
                <label htmlFor="merge-name-group2">
                  Inherit &quot;{group2.name}&quot;
                </label>
              </div>

              <div className="merge-dialog__radio-option">
                <input
                  type="radio"
                  id="merge-name-custom"
                  name="mergeName"
                  checked={nameOption === 'custom'}
                  onChange={() => setNameOption('custom')}
                />
                <label htmlFor="merge-name-custom">Use new name</label>
              </div>

              {nameOption === 'custom' && (
                <input
                  type="text"
                  className="merge-dialog__custom-name-input"
                  placeholder="Enter destination name..."
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  autoFocus
                />
              )}
            </div>
          </div>

          {error && <div className="merge-dialog__error">{error}</div>}
        </div>

        <div className="merge-dialog__footer">
          <button
            type="button"
            className="btn-secondary"
            onClick={onCancel}
            disabled={isLoading}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={handleConfirm}
            disabled={!canConfirm}
          >
            {isLoading ? 'Merging...' : 'Confirm Merge'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default MergeDialog;
