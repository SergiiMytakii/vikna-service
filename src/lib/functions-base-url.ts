const LOCAL_FUNCTIONS_BASE_URL =
  "http://127.0.0.1:5001/vikna-service-prod/europe-west1";

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

function isLocalHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

export function getFunctionsBaseUrl(): string {
  const configured = trimTrailingSlashes(
    process.env.NEXT_PUBLIC_FIREBASE_FUNCTIONS_BASE_URL || ""
  );

  if (typeof window === "undefined") {
    return configured || "/api";
  }

  if (isLocalHostname(window.location.hostname)) {
    return configured || LOCAL_FUNCTIONS_BASE_URL;
  }

  return "/api";
}
