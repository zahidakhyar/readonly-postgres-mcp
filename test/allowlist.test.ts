import { describe, expect, it } from "vitest";
import { isEmailAllowed } from "../src/allowlist";

describe("isEmailAllowed", () => {
  const list = "alice@example.com, other@example.com";

  it("allows a verified email on the list", () => {
    expect(isEmailAllowed("alice@example.com", true, list)).toBe(true);
  });

  it("ignores case and surrounding spaces", () => {
    expect(isEmailAllowed(" Alice@Example.com ", true, " ALICE@example.com ,x@y.z")).toBe(true);
  });

  it("rejects an email not on the list", () => {
    expect(isEmailAllowed("stranger@gmail.com", true, list)).toBe(false);
  });

  it("rejects an unverified email even when listed", () => {
    expect(isEmailAllowed("alice@example.com", false, list)).toBe(false);
    expect(isEmailAllowed("alice@example.com", undefined, list)).toBe(false);
  });

  it("rejects everyone when the list is empty or missing", () => {
    expect(isEmailAllowed("alice@example.com", true, "")).toBe(false);
    expect(isEmailAllowed("alice@example.com", true, " , ")).toBe(false);
    expect(isEmailAllowed("alice@example.com", true, undefined)).toBe(false);
  });

  it("rejects a missing email", () => {
    expect(isEmailAllowed(undefined, true, list)).toBe(false);
  });
});
