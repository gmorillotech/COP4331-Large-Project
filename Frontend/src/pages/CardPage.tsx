import CardUI from '../components/CardUI.tsx';
import LoggedInName from '../components/LoggedInName.tsx';
import PageTitle from '../components/PageTitle.tsx';

function CardPage() {
  return (
    <div>
      <PageTitle />
      <LoggedInName />
      <CardUI />
    </div>
  );
}

export default CardPage;
