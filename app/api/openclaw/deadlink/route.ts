import { NextRequest, NextResponse } from "next/server"
import { execFile } from "node:child_process"
import { WORKSPACE } from "@/lib/openclaw"

export const dynamic = "force-dynamic"
export const maxDuration = 120

/**
 * Act on one dead link: hold the listing, clear the url, or correct it.
 *
 * All three go through the workspace's own deadlink-action.py, which owns the rules --
 * it refuses a quarantined record, refuses to clear a url whose status is a 4xx other than
 * 404/410 without --force (a 403 is usually bot mitigation, not a dead site), verifies a
 * tenant write by reading it back, and records a human-typed url as a `user` source.
 *
 * Every argument is passed as argv, never through a shell, and the action is one of three
 * fixed strings. A url is validated here as well as there, because the one place a caller
 * controls a value is the one place to check it.
 */
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}) as Record<string, unknown>)
  const client = String(b.client ?? "")
  const id = String(b.id ?? "")
  const name = String(b.name ?? "")
  const url = String(b.url ?? "")
  const status = String(b.status ?? "")
  const action = String(b.action ?? "")
  const value = String(b.value ?? "")
  const apply = b.apply === true
  const force = b.force === true

  if (!/^[A-Za-z0-9_-]{2,32}$/.test(client)) {
    return NextResponse.json({ error: "bad client" }, { status: 400 })
  }
  if (!/^[A-Za-z0-9_-]{2,64}$/.test(id)) {
    return NextResponse.json({ error: "bad record id" }, { status: 400 })
  }

  const argv = ["deadlink-action.py", "--client", client, "--id", id]
  if (name) argv.push("--name", name.slice(0, 120))
  if (url) argv.push("--url", url.slice(0, 500))
  if (status) argv.push("--status", status.slice(0, 8))

  if (action === "hold") {
    const reason = value.trim()
    if (reason.length < 4) {
      return NextResponse.json(
        { error: "a hold needs a reason — it is the only record of why" },
        { status: 400 }
      )
    }
    argv.push("--hold", reason.slice(0, 200))
  } else if (action === "clear") {
    argv.push("--clear-url")
    if (force) argv.push("--force")
  } else if (action === "set") {
    if (!/^https?:\/\/[^\s]{4,400}$/.test(value)) {
      return NextResponse.json({ error: "a corrected url must be http(s)" }, { status: 400 })
    }
    argv.push("--set-url", value)
  } else {
    return NextResponse.json({ error: "action must be hold, clear or set" }, { status: 400 })
  }
  if (apply) argv.push("--apply")

  const out = await new Promise<{ code: number | null; text: string }>((resolve) => {
    const child = execFile(
      "python3",
      argv,
      { cwd: WORKSPACE, timeout: 90_000, maxBuffer: 2 * 1024 * 1024 },
      (_err, stdout, stderr) =>
        resolve({ code: child.exitCode, text: `${stdout || ""}${stderr || ""}`.trim() })
    )
  })

  return NextResponse.json({
    ok: out.code === 0,
    applied: apply && out.code === 0,
    exitCode: out.code,
    command: `python3 ${argv.join(" ")}`,
    output: out.text.slice(-4000),
  })
}
