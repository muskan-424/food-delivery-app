import { describe, expect, it } from "vitest";
import {
  accountLast4,
  isValidIfsc,
  normalizeAccountNumber,
  normalizeIfsc,
} from "../utils/bankValidation.js";
import { isValidPan, normalizePan, panLast4 } from "../utils/panValidation.js";

describe("bankValidation", () => {
  it("normalizes IFSC", () => {
    expect(normalizeIfsc(" hdfc0001234 ")).toBe("HDFC0001234");
  });

  it("accepts valid IFSC", () => {
    expect(isValidIfsc("HDFC0001234")).toBe(true);
  });

  it("rejects invalid IFSC", () => {
    expect(isValidIfsc("INVALID")).toBe(false);
    expect(isValidIfsc("HDFC001234")).toBe(false);
  });

  it("normalizes account number and last4", () => {
    expect(normalizeAccountNumber("12 34 5678 90")).toBe("1234567890");
    expect(accountLast4("1234567890")).toBe("7890");
  });
});

describe("panValidation", () => {
  it("accepts valid PAN", () => {
    expect(isValidPan("ABCDE1234F")).toBe(true);
    expect(normalizePan("abcde1234f")).toBe("ABCDE1234F");
  });

  it("rejects invalid PAN", () => {
    expect(isValidPan("ABCD1234F")).toBe(false);
    expect(isValidPan("")).toBe(false);
  });

  it("extracts pan digit segment", () => {
    expect(panLast4("ABCDE1234F")).toBe("1234");
  });
});
