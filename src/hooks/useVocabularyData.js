import { useEffect, useState } from "react";

export function useVocabularyData(trackId) {
  const [vocabulary, setVocabulary] = useState([]);
  const [catalog, setCatalog] = useState(null);
  const [vocabularyError, setVocabularyError] = useState("");

  useEffect(() => {
    let isCancelled = false;

    async function loadVocabulary() {
      try {
        setVocabularyError("");

        const catalogResponse = await fetch(`${import.meta.env.BASE_URL}data/catalog.json`);

        if (!catalogResponse.ok) {
          throw new Error(`HTTP ${catalogResponse.status}`);
        }

        const nextCatalog = await catalogResponse.json();

        if (isCancelled) {
          return;
        }

        setCatalog(nextCatalog);

        const track = nextCatalog.tracks?.[trackId];

        if (!track || !track.available) {
          throw new Error(`Track is unavailable: ${trackId}`);
        }

        const chunkPayloads = await Promise.all(
          track.chunkFiles.map(async (chunkFile) => {
            const chunkResponse = await fetch(`${import.meta.env.BASE_URL}${chunkFile.path}`);

            if (!chunkResponse.ok) {
              throw new Error(`Failed to load chunk: ${chunkFile.path}`);
            }

            return chunkResponse.json();
          })
        );

        if (!isCancelled) {
          setVocabulary(chunkPayloads.flat());
        }
      } catch (error) {
        if (!isCancelled) {
          setVocabulary([]);
          setVocabularyError("load-failed");
        }
      }
    }

    loadVocabulary();

    return () => {
      isCancelled = true;
    };
  }, [trackId]);

  return {
    vocabulary,
    catalog,
    vocabularyError
  };
}
