import { useNavigate } from 'react-router-dom';
import SessionManager from '../components/SessionManager';
import './DataCollectionPage.css';

function DataCollectionPage() {
  const navigate = useNavigate();
  return (
    <div className="datacollection-page">
      <button className="datacollection-back-btn" onClick={() => navigate('/home')}>
        ← Back to Map
      </button>
      <div className="datacollection-content">
        <h1 className="datacollection-title">Contribute Data</h1>
        <p className="datacollection-subtitle">Help other students by reporting noise and occupancy at your study spot.</p>
        <SessionManager />
      </div>
    </div>
  );
}

export default DataCollectionPage;