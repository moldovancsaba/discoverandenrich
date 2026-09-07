import { NextRequest, NextResponse } from "next/server"
import fs from "node:fs"
import path from "node:path"
import { WORKSPACE } from "@/lib/openclaw"

/**
 * A human verdict on a proposal.
 *
 * approvals.txt says, in its own header: "The agent may READ this file. It must never write
 * to it." That rule exists so the loop cannot approve its own proposals. A person clicking
 * Approve in this page is the human writing, which is the path the rule protects -- so every
 * line written here is stamped with the time and with `via admin page`, and a reader can
 * always tell a human decision from an agent one.
 *
 * Nothing is applied here. The line is appended and the workspace's own apply-approved cron
 * job picks it up on its next hourly run, through exactly the same path a hand-edited line
 * would take.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}) as Record<string, unknown>)
  const id = String(body.id ?? "")
  const verdict = String(body.verdict ?? "")
  const note = String(body.note ?? "")

  if (!/^[a-zA-Z0-9._-]{2,80}$/.test(id)) {
    return NextResponse.json({ error: "a proposal id is required" }, { status: 400 })
  }
  if (verdict !== "approve" && verdict !== "reject") {
    return NextResponse.json({ error: "verdict must be approve or reject" }, { status: 400 })
  }

  const file = path.join(WORKSPACE, "approvals.txt")
  const stamp = new Date().toISOString().replace(/\.\d+Z$/, "Z")
  const clean = note.replace(/[\r\n]+/g, " ").slice(0, 160)

  try {
    const existing = fs.readFileSync(file, "utf8")
    // Never write the same verdict twice. The file is append-only history, and a duplicate
    // line reads as a second decision that was never taken.
    if (new RegExp(`^\\s*${verdict}\\s+${id}\\s*$`, "m").test(existing)) {
      return NextResponse.json({ ok: true, duplicate: true, id, verdict })
    }
    fs.appendFileSync(
      file,
      `\n# ${stamp} — via admin page${clean ? `: ${clean}` : ""}\n${verdict} ${id}\n`
    )
    return NextResponse.json({ ok: true, id, verdict, at: stamp })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
