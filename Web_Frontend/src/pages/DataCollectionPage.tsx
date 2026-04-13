import { useNavigate } from 'react-router-dom';
import SessionManager from '../components/SessionManager';
import './DataCollectionPage.css';

function DataCollectionPage() {
  const navigate = useNavigate();
  return (
    <main>
    <div className="datacollection-page">
      <header className="datacollection-topbar">
        <button className="datacollection-back-btn" onClick={() => navigate('/home')}>
          Back to Map
        </button>
        <h1 className="datacollection-title">Contribute Data</h1>
        <span className="datacollection-topbar__spacer" aria-hidden="true" />
      </header>
      <div className="datacollection-content">
        <SessionManager />
      </div>
    </div>
    </main>
  );
}

export default DataCollectionPage;