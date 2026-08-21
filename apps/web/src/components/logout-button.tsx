"use client";

import { useRouter } from "next/navigation";

export const LogoutButton = () => {
  const router = useRouter();
  return (
    <button
      className="secondary"
      onClick={() => {
        void (async () => {
          await fetch("/api/auth/logout", { method: "POST" });
          router.replace("/login");
          router.refresh();
        })();
      }}
      type="button"
    >
      Log out
    </button>
  );
};
