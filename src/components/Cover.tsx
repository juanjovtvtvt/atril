import { useState, type CSSProperties } from 'react';
import { coverUrl, type Book } from '../api';

type CoverBook = Pick<Book, 'id' | 'title' | 'author' | 'color' | 'hasCover'>;

/**
 * The EPUB's real cover when it has one. Otherwise (converted PDFs, almost always) a generated
 * cover: pigment color, serif title and author, with a spine shadow so it reads as a book.
 */
export function Cover({ book, width, className = '', style }: { book: CoverBook; width: number; className?: string; style?: CSSProperties }) {
  const [broken, setBroken] = useState(false);
  const showImage = book.hasCover && !broken;
  return (
    <div className={`cover ${className}`} style={{ width, background: book.color, ...style }}>
      {showImage ? (
        <img src={coverUrl(book.id)} alt="" loading="lazy" onError={() => setBroken(true)} />
      ) : (
        <div className="cover-gen">
          <span className="cover-title" style={{ fontSize: Math.max(8, Math.round(width * 0.135)) }}>
            {book.title}
          </span>
          <span className="cover-author" style={{ fontSize: Math.max(6, Math.round(width * 0.075)) }}>
            {book.author}
          </span>
        </div>
      )}
    </div>
  );
}
