"use client";

import { useState, type SyntheticEvent } from "react";
import { useRouter } from "next/navigation";

export const LoginForm = () => {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "limited">("idle");
  const [message, setMessage] = useState("");

  const submit = async (event: SyntheticEvent<HTMLFormElement, SubmitEvent>) => {
    event.preventDefault();
    setStatus("loading");
    setMessage("");
    const data = new FormData(event.currentTarget);
    const response = await fetch("/api/auth/login", {
      body: JSON.stringify({ password: data.get("password"), username: data.get("username") }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const result = (await response.json()) as { message?: string };
    if (!response.ok) {
      setStatus(response.status === 429 ? "limited" : "error");
      setMessage(result.message ?? "The username or password is invalid.");
      return;
    }
    router.replace("/");
    router.refresh();
  };

  return (
    <form
      className="auth-form"
      onSubmit={(event) => {
        void submit(event);
      }}
    >
      <label htmlFor="username">Username</label>
      <input autoComplete="username" id="username" name="username" required />
      <label htmlFor="password">Password</label>
      <div className="password-field">
        <input
          autoComplete="current-password"
          id="password"
          name="password"
          required
          type={showPassword ? "text" : "password"}
        />
        <button
          aria-label={showPassword ? "Hide password" : "Show password"}
          className="secondary compact"
          onClick={() => {
            setShowPassword((value) => !value);
          }}
          type="button"
        >
          {showPassword ? "Hide" : "Show"}
        </button>
      </div>
      {message ? (
        <p className="form-message error" role="alert">
          {message}
        </p>
      ) : null}
      <button disabled={status === "loading"} type="submit">
        {status === "loading"
          ? "Signing in…"
          : status === "limited"
            ? "Try again later"
            : "Sign in"}
      </button>
    </form>
  );
};
