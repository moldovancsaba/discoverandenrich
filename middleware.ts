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
 *
 * THE HOST CHECK DOES NOT STOP THE OWNER'S OWN BROWSER. Found by adversarial review on
 * 2026-09-08 and reproduced: a hostile web page open in the same browser as this admin page
 * can make that browser POST to http://localhost:3000/api/openclaw/run. The browser sends
 * `Host: localhost:3000` -- it is addressing localhost -- so the host check passes by
 * construction. No CORS preflight is needed: `text/plain` is a CORS-safelisted content type
 * and `req.json()` parses the body regardless of the declared type, so the request goes out,
 * the task runs, and the attacker never needs to read the response. The task ids, including
 * the two that write to live customer databases and the confirm token that equals the id,
 * are public in this public repository. Binding the server to 127.0.0.1 does nothing here:
 * the request comes FROM this machine.
 *
 * So a state-changing request must also prove WHERE it came from, using the two headers a
 * browser sets and a page cannot forge or suppress: `Origin` must be a loopback origin, and
 * `Sec-Fetch-Site` must be same-origin (or `none`, a typed URL). A third gate for browsers
 * old enough to send neither: a non-GET request must declare `application/json`, which a
 * cross-site page cannot send without a preflight, and no OPTIONS handler here grants one.
 * GET and HEAD are exempt on purpose -- they change nothing, a cross-site page cannot read
 * their response without CORS, and refusing them would break the owner clicking a link to
 * this page from a chat message (that navigation arrives as `Sec-Fetch-Site: cross-site`).
 * A plain `curl` with no browser headers still passes, which is what the operator checks
 * and the workspace's own scripts use.
 */

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"])
// Methods with no side effects. Everything else must prove it came from this page.
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"])

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

  // Provenance, for anything that can change state. See the header comment: the Host
  // check is satisfied by the victim's own browser, so a write must also come from this
  // page. Each of the three gates alone closes the browser path; they are independent
  // so that an old browser, a new browser and a misconfigured one are each refused.
  if (!SAFE_METHODS.has(req.method)) {
    const origin = req.headers.get("origin")
    if (origin !== null) {
      let local = false
      try {
        local = origin !== "null" && LOCAL_HOSTS.has(hostname(new URL(origin).host))
      } catch {
        local = false
      }
      if (!local) return new NextResponse(null, { status: 404 })
    }
    const site = req.headers.get("sec-fetch-site")
    if (site !== null && site !== "same-origin" && site !== "none") {
      return new NextResponse(null, { status: 404 })
    }
    const type = (req.headers.get("content-type") ?? "").toLowerCase()
    if (!type.startsWith("application/json")) {
      return new NextResponse(null, { status: 415 })
    }
  }

  return NextResponse.next()
}

export const config = {
  // `/openclaw` is listed in its own right: `:path*` matches the segments BELOW a path,
  // and the bare page is the one a prober reaches first.
  matcher: ["/openclaw", "/openclaw/:path*", "/api/openclaw/:path*"],
}
