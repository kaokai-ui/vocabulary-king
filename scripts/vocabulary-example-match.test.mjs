import { describe, expect, it } from "vitest";
import {
  exampleUsesHeadword,
  normalizeEnglishTokens
} from "./vocabulary-example-match.mjs";
import { IRREGULAR_VERB_FAMILIES } from "./vocabulary-inflection-data.mjs";

describe("shared vocabulary example matcher", () => {
  it.each([
    ["tear down", "The old warehouse was torn down yesterday."],
    ["think of", "She thought of a better way to organize the files."],
    ["wrap a present", "He is wrapping a present for his friend."],
    ["time off", "She requested time-off before the holiday."],
    ["time off", "She requested timeoff before the holiday."],
    ["take one's advice", "The manager took my advice."],
    ["vary from A to B", "The numbers varied from client to client."],
    ["upon -ing", "Upon arriving, please check in at reception."],
    ["at one's disposal", "The meeting rooms are at their disposal."],
    ["at one's request", "The audit was initiated at the request of the shareholders."],
    ["tie up", "The staff tied the boxes up before lunch."],
    ["tie up", "The staff tied the large cardboard boxes up before lunch."],
    ["child", "Several children joined the tour."],
    ["analysis", "The analyses were reviewed by two editors."],
    ["leaf", "The leaves turned yellow in October."],
    ["go", "She goes to work early."],
    ["find", "The audit team found several errors."],
    ["study", "The students studied the new policy."],
    ["run", "The runner is running around the park."],
    ["lie", "They are lying about the result."],
    ["happy", "The team was happiest after the launch."],
    ["big", "The larger box is bigger than the old one."],
    ["good", "This was the best available option."],
    ["ask sb", "The teacher asked Maria to wait."],
    ["ask somebody", "The teacher asked Maria to wait."],
    ["find sth", "He found a small package."],
    ["give sb sth", "She gave a child a book."],
    ["give someone something", "She gave a child a book."],
    ["A as well as B", "The CEO, as well as the board of directors, has endorsed the merger."],
    ["be advised to do", "Passengers are strongly advised to arrive early."],
    ["be in the mood for -ing", "The team was hardly in the mood for celebrating."],
    ["be used to -ing", "The representative is quite used to handling objections."],
    ["unplug a device", "Please unplug the device before maintenance."],
    ["take the initiative", "Employees who take initiative are valued."],
    ["euro", "The supplier quoted the replacement parts in euros."],
    ["constitution", "The charter must follow the constitution's requirements."],
    ["inter", "The founder was interred beside the estate."],
    ["embed", "The analyst embedded charts in the report."],
    ["carry a large parcel", "The courier carried a large, unwieldy parcel upstairs."],
    ["in demand", "The product is in high demand."],
    ["lead (up/down) to", "The road leads to the main entrance."],
    ["lead (up/down) to", "The road leads up to the main entrance."],
    ["lead (up/down) to", "The road leads down to the main entrance."],
    ["in one's absence", "The director acted in the director's absence."],
    ["attend to a client", "The account manager attended to a VIP client's request."],
    ["be on a trip", "The COO will be on a business trip until Friday."],
    ["fold in half", "Please fold the document in half before mailing it."],
    ["convert A to B", "We converted raw data into actionable insights."],
    ["give a call", "Please give me a call tomorrow."],
    ["make an impression", "She made a good impression at the interview."],
    ["prepare a meal", "Participants prepared a healthy meal."],
    ["use one's hands", "He used his hands to move the box."],
    ["prepare oneself", "She prepared herself for the exam."]
  ])("matches %s in its supported form", (word, sentence) => {
    expect(exampleUsesHeadword(word, sentence)).toBe(true);
  });

  it("supports the requested regular spelling rules", () => {
    expect(exampleUsesHeadword("book", "The books are on the shelf.")).toBe(true);
    expect(exampleUsesHeadword("watch", "The guard watches the entrance.")).toBe(true);
    expect(exampleUsesHeadword("city", "The cities are easy to reach.")).toBe(true);
    expect(exampleUsesHeadword("love", "They loved the new design.")).toBe(true);
    expect(exampleUsesHeadword("study", "The team studied the report.")).toBe(true);
    expect(exampleUsesHeadword("use", "She is using the new device.")).toBe(true);
    expect(exampleUsesHeadword("wrap", "She is wrapping a present.")).toBe(true);
    expect(exampleUsesHeadword("tie", "They are tying the package.")).toBe(true);
    expect(exampleUsesHeadword("nice", "The proposal is the nicest of the three.")).toBe(true);
    expect(exampleUsesHeadword("happy", "They were happier after the call.")).toBe(true);
  });

  it("inflects every lexical word in a phrase and allows at most four inserted particle words", () => {
    expect(exampleUsesHeadword("take order", "They took orders throughout the day.")).toBe(true);
    expect(exampleUsesHeadword("tie up", "She tied the large cardboard boxes up.")).toBe(true);
    expect(exampleUsesHeadword("tie up", "She tied the large cardboard heavy boxes up.")).toBe(false);
  });

  it("uses word boundaries and does not mistake derivations for inflections", () => {
    expect(exampleUsesHeadword("south", "The southern region receives more rain.")).toBe(false);
    expect(exampleUsesHeadword("departure", "They depart for the airport at noon.")).toBe(false);
    expect(exampleUsesHeadword("depart", "The departure was delayed by weather.")).toBe(false);
    expect(exampleUsesHeadword("gun", "The plan has begun to work.")).toBe(false);
    expect(exampleUsesHeadword("wrap", "A present was delivered yesterday.")).toBe(false);
    expect(exampleUsesHeadword("board flight", "Passengers discussed the flight schedule.")).toBe(false);
  });

  it("normalizes hyphens without weakening token boundaries", () => {
    expect(normalizeEnglishTokens("time-off")).toEqual(["time", "__hyphen__", "off"]);
    expect(exampleUsesHeadword("time off", "Her time off starts tomorrow.")).toBe(true);
  });

  it("keeps a hand-curated irregular verb table at approximately two hundred lemmas", () => {
    expect(new Set(IRREGULAR_VERB_FAMILIES.map(([lemma]) => lemma)).size).toBeGreaterThanOrEqual(200);
  });
});
