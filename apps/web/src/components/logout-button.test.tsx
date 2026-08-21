// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LogoutButton } from "./logout-button";

const refresh = vi.fn();
const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, replace }) }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("LogoutButton", () => {
  it("ends the server session before returning to login", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ authenticated: false }), { status: 200 }));
    render(<LogoutButton />);
    await userEvent.click(screen.getByRole("button", { name: "Log out" }));
    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith("/login");
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/logout", { method: "POST" });
    expect(refresh).toHaveBeenCalledOnce();
  });
});
