// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { DelayedTooltip, DelegationIndicator, HelpTip } from "./delayed-tooltip";

describe("delayed delegation tooltips", () => {
  afterEach(cleanup);

  it("renders reusable help content accessibly", () => {
    render(
      <>
        <DelayedTooltip content="More detail" label="More information">
          Trigger
        </DelayedTooltip>
        <HelpTip label="sharing">Sharing explanation</HelpTip>
      </>,
    );

    expect(screen.getByLabelText("More information")).toHaveTextContent("TriggerMore detail");
    expect(screen.getByRole("tooltip", { name: "More detail" })).toBeInTheDocument();
    expect(screen.getByLabelText("Help: sharing")).toHaveTextContent("Sharing explanation");
  });

  it("does not add an indicator when nobody has access", () => {
    const rendered = render(<DelegationIndicator delegates={[]} />);
    expect(rendered.container).toBeEmptyDOMElement();
  });

  it("lists active and invited delegates with aliases and public profiles", () => {
    render(
      <DelegationIndicator
        delegates={[
          {
            alias: null,
            displayName: "Morgan",
            profileDescription: null,
            status: "active",
          },
          {
            alias: "Designer",
            displayName: "Taylor",
            profileDescription: "Product design delegate",
            status: "invite_pending",
          },
        ]}
      />,
    );

    expect(screen.getByLabelText("2 delegates")).toHaveTextContent("2");
    expect(screen.getByText("Morgan")).toBeInTheDocument();
    expect(screen.getByText("Taylor · Designer")).toBeInTheDocument();
    expect(screen.getByText(/invitation pending/u)).toBeInTheDocument();
    expect(screen.getByText("Product design delegate")).toBeInTheDocument();
  });

  it("supports a compact single-delegate marker", () => {
    render(
      <DelegationIndicator
        compact
        delegates={[
          {
            alias: "QA",
            displayName: "Casey",
            profileDescription: "Quality assurance",
          },
        ]}
      />,
    );

    expect(screen.getByLabelText("1 delegate")).toBeInTheDocument();
    expect(screen.getByLabelText("1 delegate")).not.toHaveTextContent("1Quality");
  });
});
