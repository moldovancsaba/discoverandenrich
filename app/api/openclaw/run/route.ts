import { NextRequest, NextResponse } from "next/server"
import { execFile } from "node:child_process"
import { WORKSPACE } from "@/lib/openclaw"
import { byId, TASKS } from "@/lib/tasks"

export const dynamic = "force-dynamic"
export const maxDuration = 900

/** The allowlist, for the page to render. */
export async function GET() {
  return NextResponse.json({
    tasks: TASKS.map(({ argv, ...rest }) => ({ ...rest, command: argv.join(" ") })),
  })
}

/**
 * Run one allowlisted maintenance task on this machine.
 *
 * `execFile`, never a shell: the argv comes from the table in lib/tasks.ts and the request
 * supplies only an id. There is no path to passing a flag, a filename or a shell string, so
 * this endpoint cannot be turned into arbitrary execution by anything the caller sends.
 *
 * A task that writes to a live customer database must be confirmed explicitly, and the
 * confirmation names the task — so a stray POST, a double-click or a replayed request
 * cannot start one.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}) as Record<string, unknown>)
  const id = String(body.id ?? "")
  const confirm = String(body.confirm ?? "")

  const task = byId(id)
  if (!task) {
    return NextResponse.json({ error: `unknown task: ${id}` }, { status: 400 })
  }
  if (task.writes && confirm !== task.id) {
    return NextResponse.json(
      {
        error:
          `${task.id} writes to a live customer database. Re-send with confirm="${task.id}" ` +
          `to run it.`,
      },
      { status: 409 }
    )
  }

  const started = Date.now()
  const result = await new Promise<{ code: number | null; out: string; timedOut: boolean }>(
    (resolve) => {
      const child = execFile(
        "python3",
        task.argv,
        { cwd: WORKSPACE, timeout: task.timeoutMs, maxBuffer: 8 * 1024 * 1024 },
        (err, stdout, stderr) => {
          const out = `${stdout || ""}${stderr || ""}`.trimEnd()
          // A timeout is not a failure of the world, it is us stopping early. Said plainly
          // so a reader never records "it found nothing" when we simply stopped looking.
          const timedOut = !!err && (err as NodeJS.ErrnoException).code === "ETIMEDOUT"
          resolve({ code: child.exitCode, out, timedOut })
        }
      )
    }
  )

  return NextResponse.json({
    id: task.id,
    label: task.label,
    command: `python3 ${task.argv.join(" ")}`,
    cwd: WORKSPACE,
    exitCode: result.code,
    timedOut: result.timedOut,
    seconds: Math.round((Date.now() - started) / 1000),
    output: result.out.slice(-20_000),
  })
}
