import { NextRequest, NextResponse } from "next/server"
import { execFile } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { WORKSPACE } from "@/lib/openclaw"

export const dynamic = "force-dynamic"

/** The note on one record, with what a job has already taken from it. */
export async function GET(req: NextRequest) {
  const tenant = req.nextUrl.searchParams.get("client") || ""
  const id = req.nextUrl.searchParams.get("id") || ""
  try {
    const store = JSON.parse(
      fs.readFileSync(path.join(WORKSPACE, "human-notes.json"), "utf8")
    )
    return NextResponse.json({ note: store[`${tenant}/${id}`] ?? null })
  } catch {
    // No store yet is not an error: nobody has written a note.
    return NextResponse.json({ note: null })
  }
}

/**
 * Add what a person knows about a record.
 *
 * Written through humannotes.py so the store has one owner, and appended rather than
 * replaced -- a note is history, and the record of what someone believed and when is how a
 * later reader tells a correction from a contradiction.
 *
 * A note is evidence, not an instruction. Enrichment reads it and may write a value found
 * in it, attributed `user` and never `official`: claiming the organisation's own page said
 * something it did not is the fabrication this system exists to prevent.
 */
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}) as Record<string, unknown>)
  const client = String(b.client ?? "")
  const id = String(b.id ?? "")
  const name = String(b.name ?? "")
  const text = String(b.text ?? "")

  if (!/^[A-Za-z0-9_-]{2,32}$/.test(client) || !/^[A-Za-z0-9_-]{2,64}$/.test(id)) {
    return NextResponse.json({ error: "bad client or record id" }, { status: 400 })
  }
  if (text.trim().length < 3) {
    return NextResponse.json({ error: "an empty note is not evidence" }, { status: 400 })
  }

  const py = [
    "-c",
    "import sys, json, humannotes;" +
      "d=json.load(sys.stdin);" +
      "e=humannotes.add(d['t'], d['i'], d['x'], author='owner', name=d['n']);" +
      "print(json.dumps({'ok': True, 'notes': len(e['history'])}))",
  ]

  const out = await new Promise<{ code: number | null; text: string }>((resolve) => {
    const child = execFile(
      "python3",
      py,
      { cwd: WORKSPACE, timeout: 20_000 },
      (_e, stdout, stderr) =>
        resolve({ code: child.exitCode, text: `${stdout || ""}${stderr || ""}`.trim() })
    )
    // The note goes in on stdin, never on the command line: it is pasted text that may
    // contain anything, and an argv is not the place for it.
    child.stdin?.end(JSON.stringify({ t: client, i: id, x: text, n: name }))
  })

  if (out.code !== 0) {
    return NextResponse.json({ error: out.text.slice(-400) }, { status: 500 })
  }
  return NextResponse.json({ ok: true, output: out.text })
}
