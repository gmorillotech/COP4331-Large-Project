import LoggedInName from '../components/LoggedInName.tsx';
import MapExplorer from '../components/map/index.ts';
import ProfilePanel from '../components/ProfilePanel';

function HomePage() {
  return (
    <div>
      <ProfilePanel />
      <LoggedInName />
      <MapExplorer />
    </div>
  );
}

export default HomePage;
