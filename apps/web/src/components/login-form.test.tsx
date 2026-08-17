// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LoginForm } from "./login-form";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), replace }) }));

describe("LoginForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("supports accessible password visibility without changing the value", async () => {
    render(<LoginForm />);
    const password = screen.getByLabelText("Password");
    await userEvent.type(password, "synthetic password");
    expect(password).toHaveAttribute("type", "password");
    await userEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(password).toHaveAttribute("type", "text");
    expect(password).toHaveValue("synthetic password");
  });

  it("renders generic failure and rate-limit states", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ message: "The username or password is invalid." }), {
        status: 401,
      }),
    );
    render(<LoginForm />);
    await userEvent.type(screen.getByLabelText("Username or email"), "unknown");
    await userEvent.type(screen.getByLabelText("Password"), "wrong password");
    const form = screen.getByRole("button", { name: "Sign in" }).closest("form");
    expect(form).not.toBeNull();
    if (form !== null) fireEvent.submit(form);
    expect(await screen.findByRole("alert")).toHaveTextContent("username or password is invalid");
  });

  it("redirects after a successful login", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ authenticated: true }), { status: 200 }),
    );
    render(<LoginForm />);
    await userEvent.type(screen.getByLabelText("Username or email"), "synthetic-owner");
    await userEvent.type(screen.getByLabelText("Password"), "synthetic password");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith("/");
    });
  });
});
