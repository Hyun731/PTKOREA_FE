/** @type {import('next').NextConfig} */
// The browser talks to one origin: /v1/* is proxied to the API server, so the app can be opened
// from another machine (a tunnel or LAN address) without exposing the API port separately.
const API_ORIGIN = process.env.API_ORIGIN ?? "http://127.0.0.1:8000";

const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [{ source: "/v1/:path*", destination: `${API_ORIGIN}/v1/:path*` }];
  },
  experimental: {
    // AI edits and hashtag discovery can take minutes; the default proxy timeout is 30s.
    proxyTimeout: 300_000,
  },
};
export default nextConfig;
