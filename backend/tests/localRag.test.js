import { describe, expect, it } from "vitest";
import { retrieveLocalRag, resetLocalRagCache } from "../services/localRagService.js";

describe("retrieveLocalRag", () => {
  it("returns FAQ chunks for order tracking query", () => {
    resetLocalRagCache();
    const chunks = retrieveLocalRag("how do I track my order", 3);
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0].source).toContain("tomato_help_faq");
    expect(chunks[0].score).toBeGreaterThan(0);
  });

  it("returns empty for nonsense query", () => {
    resetLocalRagCache();
    const chunks = retrieveLocalRag("xyzzy plugh", 3);
    expect(chunks.length).toBe(0);
  });
});
