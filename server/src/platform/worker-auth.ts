import { createRemoteJWKSet, jwtVerify } from "jose";
import type { AuthContext } from "../auth";

type WorkerAuthConfig = {
  domain: string;
  clientId: string;
};

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function getJWKS(domain: string) {
  if (!jwksCache.has(domain)) {
    jwksCache.set(
      domain,
      createRemoteJWKSet(new URL(`https://${domain}/.well-known/jwks.json`)),
    );
  }

  return jwksCache.get(domain)!;
}

export function createWorkerTokenVerifier(config: WorkerAuthConfig) {
  return async (token: string): Promise<AuthContext | null> => {
    const { domain, clientId } = config;

    if (!domain || !clientId) {
      console.warn("[auth] Auth0 not configured, skipping verification");
      return null;
    }

    try {
      const jwks = getJWKS(domain);
      const { payload } = await jwtVerify(token, jwks, {
        issuer: `https://${domain}/`,
        audience: clientId,
      });

      return {
        sub: payload.sub ?? "",
        email:
          ((payload as Record<string, unknown>).email as string | undefined) ??
          "",
        userId: payload.sub ?? "",
      };
    } catch (error) {
      console.error("[auth] Token verification failed:", error);
      return null;
    }
  };
}
