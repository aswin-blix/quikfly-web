// The website and admin Workers serve static files; this script runs first for page requests only
// (`run_worker_first` in each wrangler.jsonc leaves /_next/* and /assets/* to the assets, free).
// A request to the old *.workers.dev address gets a permanent redirect to the same path and query on
// CANONICAL_ORIGIN (each Worker's own `vars`), so links shared by apps up to 0.1.18 still land on the
// right page. Every other host (quikfly.in, localhost in `wrangler dev`) is served the files as before.
// The API Worker doesn't use this: released apps call its workers.dev address directly.
const REDIRECT_HOST_SUFFIX = ".workers.dev";
const REDIRECT_STATUS = 301;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.hostname.endsWith(REDIRECT_HOST_SUFFIX)) {
      return Response.redirect(new URL(url.pathname + url.search, env.CANONICAL_ORIGIN).toString(), REDIRECT_STATUS);
    }
    return env.ASSETS.fetch(request);
  },
};
