import { Context, Next } from "hono";
import jwt from "jsonwebtoken";
import jwksRsa from "jwks-rsa";

const auth0Domain = process.env.AUTH0_DOMAIN;
const auth0ClientId = process.env.AUTH0_CLIENT_ID;

if (!auth0Domain || !auth0ClientId) {
  console.warn(
    "Auth0 credentials not configured. Auth will be disabled. Set AUTH0_DOMAIN and AUTH0_CLIENT_ID to enable.",
  );
}

export interface AuthContext {
  userId: string;
  email: string;
  sub: string;
}

const jwksClient = auth0Domain
  ? jwksRsa({
      jwksUri: `https://${auth0Domain}/.well-known/jwks.json`,
      cache: true,
      rateLimit: true,
      jwksRequestsPerMinute: 5,
    })
  : null;

function getSigningKey(kid: string): Promise<string> {
  return new Promise((resolve, reject) => {
    jwksClient!.getSigningKey(kid, (err, key) => {
      if (err) return reject(err);
      resolve(key!.getPublicKey());
    });
  });
}

export async function verifyNodeToken(
  token: string,
): Promise<AuthContext | null> {
  if (!auth0Domain || !auth0ClientId || !jwksClient) {
    console.warn("[auth] Auth0 not configured, skipping verification");
    return null;
  }

  try {
    const decoded = jwt.decode(token, { complete: true });
    if (!decoded || typeof decoded === "string" || !decoded.header.kid) {
      console.error(
        "[auth] token decode failed or missing kid. header:",
        decoded && typeof decoded !== "string" ? decoded.header : decoded,
      );
      return null;
    }

    console.debug(
      "[auth] verifying token kid:",
      decoded.header.kid,
      "alg:",
      decoded.header.alg,
    );
    const rawPayload = decoded.payload as jwt.JwtPayload;
    console.debug(
      "[auth] token claims: iss=%s aud=%j sub=%s exp=%s",
      rawPayload.iss,
      rawPayload.aud,
      rawPayload.sub,
      rawPayload.exp ? new Date(rawPayload.exp * 1000).toISOString() : "none",
    );
    console.debug(
      "[auth] expected: iss=https://%s/ aud=%s",
      auth0Domain,
      auth0ClientId,
    );

    const signingKey = await getSigningKey(decoded.header.kid);

    const verifyOptions: jwt.VerifyOptions = {
      algorithms: ["RS256"],
      issuer: `https://${auth0Domain}/`,
      audience: auth0ClientId,
    };

    const payload = jwt.verify(
      token,
      signingKey,
      verifyOptions,
    ) as jwt.JwtPayload;

    console.debug("[auth] token verified for sub:", payload.sub);
    return {
      userId: payload.sub ?? "",
      email: (payload.email as string | undefined) ?? "",
      sub: payload.sub ?? "",
    };
  } catch (error) {
    console.error("[auth] Token verification failed:", error);
    return null;
  }
}

export async function authMiddleware(
  c: Context,
  next: Next,
): Promise<Response | void> {
  const authHeader = c.req.header("Authorization");
  const path = c.req.path;
  const method = c.req.method;

  if (!authHeader) {
    console.warn("[auth] missing Authorization header for %s %s", method, path);
    c.set("auth", null);
    await next();
    return;
  }

  if (!authHeader.startsWith("Bearer ")) {
    console.warn(
      "[auth] malformed Authorization header for %s %s",
      method,
      path,
    );
    return c.json({ error: "Unauthorized" }, 401);
  }

  const token = authHeader.replace("Bearer ", "");
  const auth = await verifyNodeToken(token);

  if (!auth) {
    console.warn("[auth] token rejected for %s %s", method, path);
    return c.json({ error: "Unauthorized" }, 401);
  }

  console.debug(
    "[auth] accepted subject for %s %s: %s",
    method,
    path,
    auth.sub,
  );
  c.set("auth", auth);
  await next();
}

export function requireAuth(c: Context): AuthContext {
  const auth = c.get("auth") as AuthContext | null;
  if (!auth) {
    throw new Error("Unauthorized");
  }
  return auth;
}

export default { verifyNodeToken, authMiddleware, requireAuth };
