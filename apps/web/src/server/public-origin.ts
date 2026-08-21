import { SafeApplicationError } from "@opsweave/domain";

const allowedProtocol = (url: URL): boolean =>
  url.protocol === "https:" ||
  (url.protocol === "http:" && ["127.0.0.1", "localhost", "::1"].includes(url.hostname));

/** Uses an operator-controlled origin for links that leave the browser session. */
export const canonicalPublicOrigin = (request: Request): string => {
  const configured = process.env.APP_BASE_URL?.trim();
  const candidate = configured === undefined || configured.length === 0 ? request.url : configured;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new SafeApplicationError(
      "configuration_error",
      "The public application URL is invalid. Update APP_BASE_URL in the deployment settings.",
      503,
    );
  }
  if (!allowedProtocol(url)) {
    throw new SafeApplicationError(
      "configuration_error",
      "The public application URL must use HTTPS.",
      503,
    );
  }
  return url.origin;
};
