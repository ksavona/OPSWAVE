// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FoundationStatus } from "./foundation-status";

describe("FoundationStatus", () => {
  it("labels planned capabilities as unavailable", () => {
    render(<FoundationStatus />);

    expect(screen.getByRole("region", { name: "Current foundation status" })).toBeInTheDocument();
    expect(screen.getByText("Foundation only")).toBeInTheDocument();
    expect(screen.getByText("Fake provider")).toBeInTheDocument();
    expect(screen.getByText("Disabled")).toBeInTheDocument();
  });
});
