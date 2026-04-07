import LoggedInName from '../components/LoggedInName.tsx';
import MapExplorer from '../components/map/index.ts';
import ProfilePanel from '../components/ProfilePanel';
import SessionManager from '../components/SessionManager';

function HomePage() {
  return (
    <div>
      <ProfilePanel />
      <LoggedInName />
      <MapExplorer />
      <SessionManager />
    </div>
  );
}

export default HomePage;
