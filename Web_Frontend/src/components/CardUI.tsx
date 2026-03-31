import type { ChangeEvent, MouseEvent } from 'react';
import { useState } from 'react';

type StoredUser = {
  id?: number;
};

type SearchResponse = {
  results: string[];
  error: string;
};

type MutationResponse = {
  error: string;
};

function getStoredUserId(): number {
  const storedUser = localStorage.getItem('user_data');

  if (!storedUser) {
    return -1;
  }

  try {
    const user: StoredUser = JSON.parse(storedUser);
    return user.id ?? -1;
  } catch {
    return -1;
  }
}

function CardUI() {
  const [message, setMessage] = useState('');
  const [searchResults, setResults] = useState('');
  const [cardList, setCardList] = useState('');
  const [search, setSearchValue] = useState('');
  const [card, setCardNameValue] = useState('');

  function handleSearchTextChange(event: ChangeEvent<HTMLInputElement>): void {
    setSearchValue(event.target.value);
  }

  function handleCardTextChange(event: ChangeEvent<HTMLInputElement>): void {
    setCardNameValue(event.target.value);
  }

  async function addCard(event: MouseEvent<HTMLButtonElement>): Promise<void> {
    event.preventDefault();
    setMessage('');

    try {
      const response = await fetch('http://localhost:5050/api/addcard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: getStoredUserId(),
          card,
        }),
      });

      const res: MutationResponse = await response.json();
      setMessage(res.error || 'Card has been added');

      if (!res.error) {
        setCardNameValue('');
      }
    } catch (error) {
      const fallback =
        error instanceof Error ? error.message : 'Unable to add card right now';
      setMessage(fallback);
    }
  }

  async function searchCard(event: MouseEvent<HTMLButtonElement>): Promise<void> {
    event.preventDefault();
    setResults('');

    try {
      const response = await fetch('http://localhost:5050/api/searchcards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: getStoredUserId(),
          search,
        }),
      });

      const res: SearchResponse = await response.json();

      if (res.error) {
        setResults(res.error);
        setCardList('');
        return;
      }

      setResults('Card(s) have been retrieved');
      setCardList(res.results.join(', '));
    } catch (error) {
      const fallback =
        error instanceof Error ? error.message : 'Unable to search cards right now';
      setResults(fallback);
      setCardList('');
    }
  }

  return (
    <div id="cardUIDiv">
      <br />
      Search:{' '}
      <input
        type="text"
        id="searchText"
        placeholder="Card To Search For"
        value={search}
        onChange={handleSearchTextChange}
      />
      <button
        type="button"
        id="searchCardButton"
        className="buttons"
        onClick={searchCard}
      >
        Search Card
      </button>
      <br />
      <span id="cardSearchResult">{searchResults}</span>
      <p id="cardList">{cardList}</p>
      <br />
      <br />
      Add:{' '}
      <input
        type="text"
        id="cardText"
        placeholder="Card To Add"
        value={card}
        onChange={handleCardTextChange}
      />
      <button type="button" id="addCardButton" className="buttons" onClick={addCard}>
        Add Card
      </button>
      <br />
      <span id="cardAddResult">{message}</span>
    </div>
  );
}

export default CardUI;
