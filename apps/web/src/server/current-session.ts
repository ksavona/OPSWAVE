import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AuthService } from "./auth-service";
import { createRateLimitGate } from "./rate-limits";
import { SESSION_COOKIE_NAME } from "./request-security";
import { getStore } from "./runtime";

export const getCurrentSession = async () => {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value ?? null;
  try {
    return await new AuthService(getStore(), createRateLimitGate()).authenticateToken(token);
  } catch {
    redirect("/login");
  }
};

export const getCurrentPrincipal = async () => {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value ?? null;
  try {
    return await new AuthService(getStore(), createRateLimitGate()).authenticatePrincipalToken(
      token,
    );
  } catch {
    redirect("/login");
  }
};
