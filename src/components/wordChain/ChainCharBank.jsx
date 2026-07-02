// Ported from IdiomKing/src/components/ChainCharBank.tsx.

export default function ChainCharBank({ tiles, onTileClick }) {
  return (
    <div className="wc-bank">
      <div className="wc-bank-inner">
        {tiles.map((tile) => (
          <button
            key={tile.id}
            className={`wc-tile${tile.used ? " wc-tile--used" : ""}`}
            onClick={() => onTileClick(tile.id)}
            disabled={tile.used}
          >
            {tile.value}
          </button>
        ))}
      </div>
    </div>
  );
}
