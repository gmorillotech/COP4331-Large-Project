import LoggedInName from '../components/LoggedInName.tsx';
import MapExplorer from '../components/map/index.ts';
import PageTitle from '../components/PageTitle.tsx';

function HomePage() {
  return (
    <div>
      <PageTitle />
      <LoggedInName />
      <MapExplorer />
    </div>
  );
}

export default HomePage;
