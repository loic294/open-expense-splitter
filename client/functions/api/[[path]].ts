type Env = {
  PUBLIC_BACKEND_URL?: string;
  BACKEND_URL?: string;
};

const corsHeaders: HeadersInit = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods":
    "GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Request-ID",
};

function getBackendUrl(env: Env) {
  const base = env.PUBLIC_BACKEND_URL || env.BACKEND_URL;
  if (!base) {
    throw new Error(
      "Missing PUBLIC_BACKEND_URL or BACKEND_URL in Cloudflare Pages environment.",
    );
  }
  return base.replace(/\/$/, "");
}

function withCorsHeaders(response: Response) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders)) {
    headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export const onRequestOptions: PagesFunction<Env> = async () => {
  return new Response(null, {
    status: 204,
    headers: corsHeaders,
  });
};

export const onRequest: PagesFunction<Env> = async (context) => {
  let backendBaseUrl: string;
  try {
    backendBaseUrl = getBackendUrl(context.env);
  } catch (error) {
    return withCorsHeaders(
      Response.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Backend URL is not configured.",
        },
        { status: 500 },
      ),
    );
  }

  const incomingUrl = new URL(context.request.url);
  const targetUrl = `${backendBaseUrl}${incomingUrl.pathname}${incomingUrl.search}`;

  const proxiedRequest = new Request(targetUrl, {
    method: context.request.method,
    headers: context.request.headers,
    body:
      context.request.method === "GET" || context.request.method === "HEAD"
        ? undefined
        : context.request.body,
    redirect: "follow",
  });

  const upstreamResponse = await fetch(proxiedRequest);
  return withCorsHeaders(upstreamResponse);
};
