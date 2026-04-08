import LoggedInName from '../components/LoggedInName.tsx';
import MapExplorer from '../components/map/index.ts';
import ProfilePanel from '../components/ProfilePanel';
import './HomePage.css';
import { useNavigate } from 'react-router-dom';

function HomePage() {
  const navigate = useNavigate();
  return (
    <div>
      <ProfilePanel />
      <LoggedInName />
      <button
        className="mic-nav-btn"
        onClick={() => navigate('/collect')}
        title="Contribute noise & occupancy data"
      >
        🎙️
      </button>
      <MapExplorer />
    </div>
  );
}

export default HomePage;
