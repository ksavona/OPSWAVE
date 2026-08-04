import { describe, expect, it } from "vitest";

import { createSyntheticIntakeFixture } from "./index.js";

describe("createSyntheticIntakeFixture", () => {
  it("is deterministic and supports explicit overrides", () => {
    expect(createSyntheticIntakeFixture()).toEqual(createSyntheticIntakeFixture());
    expect(createSyntheticIntakeFixture({ title: "Custom synthetic title" }).title).toBe(
      "Custom synthetic title",
    );
  });
});
