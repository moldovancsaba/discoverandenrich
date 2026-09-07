/**
 * Reading the local OpenClaw workspace.
 *
 * The OpenClaw system is a Python pipeline on this machine whose entire state is files in
 * one directory: which jobs exist, what each run delivered and why it dropped what it
 * dropped, what the audit measured, what is quarantined, and which proposals are waiting on
 * a person. Today none of that is visible anywhere except a truncated WhatsApp summary.
 *
 * This module reads those files and nothing else. It never runs a job, never writes to a
 * tenant, and never invents a number: where a file is missing or unreadable the caller is
 * told so explicitly, because "we could not look" and "there is nothing there" are
 * different answers and the whole pipeline is built on not confusing them.
 */
import fs from "node:fs"
import path from "node:path"

export const WORKSPACE =
  process.env.OPENCLAW_WORKSPACE ||
  "/Users/Shared/Projects/OpenClaw/.openclaw/workspace"

export type Unread = { unread: string }
export type Maybe<T> = T | Unread
export const isUnread = <T,>(v: Maybe<T>): v is Unread =>
  !!v && typeof v === "object" && "unread" in (v as object)

function readText(name: string): Maybe<string> {
  try {
    return fs.readFileSync(path.join(WORKSPACE, name), "utf8")
  } catch (e) {
    return { unread: `${name}: ${(e as Error).message}` }
  }
}

function readJson<T>(name: string): Maybe<T> {
  const raw = readText(name)
  if (isUnread(raw)) return raw
  try {
    return JSON.parse(raw) as T
  } catch (e) {
    return { unread: `${name}: ${(e as Error).message}` }
  }
}

export type Job = { app: string; client: string; operation: string; enabled: boolean }
export type Run = {
  at: string
  ok: boolean | null
  secs?: number
  delivered: number | null
  tail?: string
  output?: string
}

/** The drop tally a run printed, e.g. "page-never-mentions-children 4, page-unreadable 1".
 *  It is the difference between "this job is broken" and "this job is working and the
 *  candidates are wrong", and for a week nobody could see it at all. */
export function dropTally(run: Run): Record<string, number> {
  const out: Record<string, number> = {}
  const text = run.output || run.tail || ""
  const m = text.match(/\(([^()]*\b\d+\b[^()]*)\)\s*$/m)
  if (!m) return out
  for (const part of m[1].split(",")) {
    const hit = part.trim().match(/^(.+?)\s+(\d+)$/)
    if (hit) out[hit[1].trim()] = Number(hit[2])
  }
  return out
}

/** Which locality a run targeted, when it said. Null is "it did not say", never a guess. */
export function targetOf(run: Run): string | null {
  const m = (run.output || "").match(/^\s*targeting(?: the scarcest)?:? ([^(\n]+)/m)
  return m ? m[1].trim() : null
}

export type Proposal = {
  id: string
  severity: string
  scope: string
  status: string
  finding: string
  why: string
  action: string
}

/** PROPOSALS.md is generated markdown, so it is parsed rather than re-derived: the
 *  generator owns those numbers and this page must not compute a second version of them. */
export function parseProposals(md: string): Proposal[] {
  const out: Proposal[] = []
  const blocks = md.split(/^## /m).slice(1)
  for (const b of blocks) {
    const head = b.match(/^\[(\w+)\]\s+(\S+)\s+—\s+(\w+)/)
    if (!head) continue
    // The generator writes `- finding: ...`, plain, not bolded. Matching the wrong shape
    // silently produced empty findings on every card -- a page that looked like it was
    // working and told the reader nothing.
    const field = (label: string) => {
      const m = b.match(new RegExp(`^- (?:\\*\\*)?${label}(?:\\*\\*)?: (.+)$`, "m"))
      return m ? m[1].trim() : ""
    }
    const scope = b.match(/scope: \*\*(\w+)\*\*/)
    out.push({
      severity: head[1],
      id: head[2],
      status: head[3],
      scope: scope ? scope[1] : "",
      finding: field("finding"),
      why: field("why matters") || field("why it matters"),
      action: field("proposed action"),
    })
  }
  return out
}

export type Snapshot = {
  workspace: string
  readAt: string
  jobs: Maybe<{ jobs: Record<string, Job> }>
  runs: Maybe<Record<string, Run[]>>
  alerts: Maybe<{ checked_at: string; failed: string[]; alerts: string[] }>
  quality: Maybe<{ generated?: string; tenants: Record<string, any> }>
  quarantine: Maybe<{ updated?: string; held: any[] }>
  proposals: Proposal[] | Unread
  proposalsComputed: string | null
}

export function snapshot(): Snapshot {
  const proposalsMd = readText("PROPOSALS.md")
  let proposals: Proposal[] | Unread
  let computed: string | null = null
  if (isUnread(proposalsMd)) {
    proposals = proposalsMd
  } else {
    proposals = parseProposals(proposalsMd)
    const m = proposalsMd.match(/_last computed ([^_]+)_/)
    computed = m ? m[1].trim() : null
  }
  return {
    workspace: WORKSPACE,
    readAt: new Date().toISOString(),
    jobs: readJson("jobs.json"),
    runs: readJson("worker-runs.json"),
    alerts: readJson("ALERTS.json"),
    quality: readJson("quality-findings.json"),
    quarantine: readJson("quarantine.json"),
    proposals,
    proposalsComputed: computed,
  }
}
