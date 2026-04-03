import LoggedInName from '../components/LoggedInName.tsx';
import MapExplorer from '../components/MapExplorer.tsx';
import PageTitle from '../components/PageTitle.tsx';

function CardPage() {
  return (
    <div>
      <PageTitle />
      <LoggedInName />
      <MapExplorer />
    </div>
  );
}

export default CardPage;
