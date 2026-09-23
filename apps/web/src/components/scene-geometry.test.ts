import { describe, expect, it } from "vitest";
import { coverTransform } from "./scene-geometry";

describe("coverTransform", () => {
  it("uses one centered crop for every scene layer", () => {
    expect(coverTransform(1672, 941, 1440, 900)).toEqual({
      width: 1599.15,
      height: 900,
      x: -79.57,
      y: 0,
    });
  });

  it("keeps narrow crops centered without changing source proportions", () => {
    const crop = coverTransform(1672, 941, 390, 844);
    expect(crop.height).toBe(844);
    expect(crop.width).toBeGreaterThan(390);
    expect(crop.x).toBeLessThan(0);
    expect(crop.y).toBe(0);
  });
});
