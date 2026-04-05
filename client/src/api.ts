import { useAuth0 } from "@auth0/auth0-react";
import { useCallback, useEffect, useState } from "react";

// Public backend URL - used for API calls
// Try PUBLIC_BACKEND_URL first (for production), then fall back to API_URL (for dev), then localhost
const API_URL =
  import.meta.env.VITE_PUBLIC_BACKEND_URL ||
  import.meta.env.VITE_API_URL ||
  "http://localhost:3000";

function createRequestId() {
  return `web_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

interface ApiError {
  error: string;
}

export async function callApi(
  endpoint: string,
  options: RequestInit & { token?: string } = {},
) {
  const { token, ...fetchOptions } = options;
  const method = fetchOptions.method ?? "GET";
  const requestId = createRequestId();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Request-ID": requestId,
  };

  if (fetchOptions.headers) {
    new Headers(fetchOptions.headers).forEach((value, key) => {
      headers[key] = value;
    });
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  console.debug("[api] request", {
    requestId,
    method,
    url: `${API_URL}${endpoint}`,
    hasToken: !!token,
    body: typeof fetchOptions.body === "string" ? fetchOptions.body : undefined,
  });

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...fetchOptions,
    headers,
  });

  if (!response.ok) {
    const error = (await response
      .json()
      .catch(() => ({ error: "API error" }))) as ApiError;
    console.error("[api] response error", {
      requestId,
      method,
      endpoint,
      status: response.status,
      responseRequestId: response.headers.get("X-Request-ID"),
      error,
    });
    throw new Error(error.error || "API error");
  }

  console.debug("[api] response ok", {
    requestId,
    method,
    endpoint,
    status: response.status,
    responseRequestId: response.headers.get("X-Request-ID"),
  });
  return response.json();
}

export function useApiCall() {
  const { getAccessTokenSilently, getIdTokenClaims } = useAuth0();

  return useCallback(
    async (endpoint: string, options: RequestInit = {}) => {
      const audience = import.meta.env.VITE_AUTH0_AUDIENCE;
      let token: string | null = null;
      let tokenSource: "access-token" | "id-token" | "none" = "none";

      if (audience) {
        console.debug("[auth] using access token with audience:", audience);
        token = await getAccessTokenSilently({
          authorizationParams: { audience },
        }).catch((e) => {
          console.error("[auth] getAccessTokenSilently failed:", e);
          return null;
        });
        tokenSource = token ? "access-token" : "none";
      } else {
        // No custom API configured — use the ID token (always a verifiable JWT)
        const claims = await getIdTokenClaims().catch((e) => {
          console.error("[auth] getIdTokenClaims failed:", e);
          return null;
        });
        token = claims?.__raw ?? null;
        if (token) {
          const parts = token.split(".");
          const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
          const payload = JSON.parse(atob(b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), "=")));
          console.debug("[auth] ID token payload:", {
            iss: payload.iss,
            aud: payload.aud,
            sub: payload.sub,
            exp: new Date(payload.exp * 1000).toISOString(),
          });
          tokenSource = "id-token";
        } else {
          console.warn("[auth] no ID token available");
        }
      }

      console.debug("[api] calling", {
        method: options.method ?? "GET",
        endpoint,
        hasToken: !!token,
        tokenSource,
      });
      return callApi(endpoint, { ...options, token: token || undefined });
    },
    [getAccessTokenSilently, getIdTokenClaims],
  );
}

export function useUserProfile() {
  const { user, isAuthenticated } = useAuth0();
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const apiCall = useApiCall();

  useEffect(() => {
    if (!isAuthenticated) {
      setProfile(null);
      return;
    }

    const fetchProfile = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await apiCall("/api/me");
        setProfile(data);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to fetch profile",
        );
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [isAuthenticated, user, apiCall]);

  return { profile, loading, error };
}
