import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

/**
 * The OpenClaw admin surface is local-only. This refuses it everywhere else.
 *
 * WHY A REFUSAL AND NOT A PASSWORD. `/openclaw` exists to drive a Python workspace on one
 * Mac -- lib/openclaw.ts pins WORKSPACE to an absolute path under /Users/Shared, and
 * app/api/openclaw/run/route.ts shells `python3` at it. None of that exists on a hosted
 * deployment, so there is nothing there to authenticate, only something to attack. A shared
 * secret would leave a working admin surface on a public URL and invite someone to finish
 * wiring it up later by setting OPENCLAW_WORKSPACE; refusing outright means a public
 * deployment cannot be turned into a live control panel by one environment variable.
 *
 * WHAT IT IS PROTECTING. Two of the allowlisted tasks (`retract-apply`, `purge-apply`) write
 * to live customer databases. Those POSTs are already gated by an argv allowlist and a
 * confirm token naming the task, and both gates hold -- but they gate WHAT may run, never
 * WHO may ask. `GET /api/openclaw/run` needed no gate and no filesystem at all: it returns
 * the whole maintenance task table, commands included, to any caller.
 *
 * WHY 404 AND NOT 403. A 403 confirms the surface exists. A reader of the public repo can
 * see these routes either way; a prober of a deployment should not learn that this one is
 * the deployment with a workspace behind it.
 *
 * THE HOST COMES FROM THE HEADERS, NOT FROM `nextUrl`. Measured 2026-09-08 against
 * `next dev`: `req.nextUrl.hostname` is the address the server is LISTENING on -- it stayed
 * "localhost" for a request carrying `Host: example.com`, so a check against it passed
 * everything and guarded nothing. `host` and `x-forwarded-host` carry the requested host,
 * and on Vercel the platform's proxy sets both, overwriting whatever a client sent.
 *
 * TWO SIGNALS, DELIBERATELY. `process.env.VERCEL` is the platform's own and no request
 * header can forge it -- but a project can be configured not to expose system environment
 * variables, so it may be absent. The header check stands alone in that case, and also
 * covers hosting that is not Vercel. Either signal saying "not local" refuses.
 */

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"])

/** The host without its port. IPv6 literals keep their brackets, which is how they arrive. */
function hostname(value: string): string {
  const host = value.trim().toLowerCase()
  if (host.startsWith("[")) {
    const close = host.indexOf("]")
    return close === -1 ? host : host.slice(0, close + 1)
  }
  const colon = host.indexOf(":")
  return colon === -1 ? host : host.slice(0, colon)
}

export function middleware(req: NextRequest) {
  if (process.env.VERCEL) {
    return new NextResponse(null, { status: 404 })
  }

  // Every host the request claims must be loopback. A missing header is not a pass:
  // `host` is required of every HTTP/1.1 request, so its absence is already irregular.
  const claimed = [req.headers.get("host"), req.headers.get("x-forwarded-host")].filter(
    (v): v is string => v !== null
  )
  if (claimed.length === 0 || !claimed.every((v) => LOCAL_HOSTS.has(hostname(v)))) {
    return new NextResponse(null, { status: 404 })
  }

  return NextResponse.next()
}

export const config = {
  // `/openclaw` is listed in its own right: `:path*` matches the segments BELOW a path,
  // and the bare page is the one a prober reaches first.
  matcher: ["/openclaw", "/openclaw/:path*", "/api/openclaw/:path*"],
}
