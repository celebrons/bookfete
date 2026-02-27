// C:\Users\USER\bookfete\frontend\src\components\dashboard\BookList.js
import React from 'react';
import { useNavigate } from 'react-router-dom';
import BookCard from './BookCard';

const BookList = ({ books, type }) => {
  const navigate = useNavigate();

  if (!books || books.length === 0) {
    return (
      <p style={{ color: '#666', textAlign: 'center', padding: '2rem' }}>
        Aucun livre {type === 'en_cours' ? 'en cours' : 'terminé'}
      </p>
    );
  }

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
      gap: '1.5rem'
    }}>
      {books.map(book => (
        <BookCard key={book.id} book={book} type={type} />
      ))}
    </div>
  );
};

export default BookList;