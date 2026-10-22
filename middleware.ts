import { NextResponse, type NextRequest } from "next/server";

// Shared-link protection: when SHARE_PASSWORD is set (e.g. while the app is opened through a
// tunnel or deployed), every page and every /v1 API call needs it. Without it nothing changes
// for local use.
//
// Backend token: when BACKEND_TOKEN is set, /v1 calls proxied to the API carry it in
// X-Backend-Token. It is added here on the server, so the browser never sees it, and the API
// refuses requests without it — the API's public tunnel address alone is not enough to call it.
export function middleware(req: NextRequest) {
  const password = process.env.SHARE_PASSWORD;
  if (password && !authorized(req.headers.get("authorization") ?? "", password)) {
    return new NextResponse("인증이 필요합니다", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="PTK factbook", charset="UTF-8"' },
    });
  }
  const token = process.env.BACKEND_TOKEN;
  if (!token || !req.nextUrl.pathname.startsWith("/v1/")) return NextResponse.next();
  const headers = new Headers(req.headers);
  headers.set("x-backend-token", token);
  headers.delete("authorization"); // the share password is for this site, not the API
  headers.set("ngrok-skip-browser-warning", "1"); // ngrok free domains otherwise answer with an HTML notice
  return NextResponse.next({ request: { headers } });
}

function authorized(header: string, password: string): boolean {
  if (!header.startsWith("Basic ")) return false;
  try {
    const [, given] = atob(header.slice(6)).split(/:(.*)/s);
    return given === password;
  } catch {
    return false; // malformed header: ask again
  }
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
