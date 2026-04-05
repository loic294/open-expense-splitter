const unauthenticatedPaths = new Set(["/", "/terms", "/privacy"]);

export function isUnauthenticatedPath(pathname: string) {
  return unauthenticatedPaths.has(pathname);
}

export function getBaseUrl() {
  return window.location.origin;
}
