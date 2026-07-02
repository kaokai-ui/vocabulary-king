import { createContext, useContext } from "react";

// Provides the localized `text` bundle to word-chain subcomponents so it does
// not have to be threaded through every component as a prop.
export const WordChainTextContext = createContext(null);

export function useWordChainText() {
  const text = useContext(WordChainTextContext);
  if (!text) {
    throw new Error("useWordChainText must be used within a WordChainTextContext provider");
  }
  return text;
}
