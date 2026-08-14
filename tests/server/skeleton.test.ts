import { describe, expect, it } from "vitest";
import { verifySkeleton } from "../../server/ai/skeleton.js";

const validJoints = [
  { id: "root", parent: null },
  { id: "torso", parent: "root" },
  { id: "left_foot", parent: "left_knee" },
  { id: "left_knee", parent: "left_hip" },
  { id: "left_hip", parent: "root" },
];

describe("verifySkeleton", () => {
  it("accepts a valid tree", () => {
    expect(verifySkeleton(validJoints)).toBe(true);
  });

  it("rejects a parent that does not exist", () => {
    expect(verifySkeleton([...validJoints, { id: "head", parent: "ghost" }])).toBe(false);
  });

  it("rejects duplicate ids", () => {
    expect(verifySkeleton([...validJoints, { id: "root", parent: null }])).toBe(false);
  });

  it("rejects zero or multiple roots", () => {
    expect(verifySkeleton([{ id: "a", parent: null }, { id: "b", parent: null }])).toBe(false);
    expect(verifySkeleton([{ id: "a", parent: "b" }])).toBe(false);
  });

  it("rejects a cycle", () => {
    const cycle = [
      { id: "root", parent: null },
      { id: "a", parent: "b" },
      { id: "b", parent: "a" },
    ];
    expect(verifySkeleton(cycle)).toBe(false);
  });

  it("rejects a disconnected forest", () => {
    const forest = [
      { id: "root", parent: null },
      { id: "a", parent: null },
    ];
    expect(verifySkeleton(forest)).toBe(false);
  });
});
