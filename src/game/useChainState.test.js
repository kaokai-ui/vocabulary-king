import { describe, expect, it } from "vitest";
import { chainReducer } from "./useChainState";

describe("chain answer visibility", () => {
  it("can hide a revealed answer without changing the hint state", () => {
    const state = { hintVisible: true, answerVisible: false };
    const revealed = chainReducer(state, { type: "REVEAL_ANSWER" });
    const hidden = chainReducer(revealed, { type: "HIDE_ANSWER" });

    expect(revealed.answerVisible).toBe(true);
    expect(hidden.answerVisible).toBe(false);
    expect(hidden.hintVisible).toBe(true);
  });
});
