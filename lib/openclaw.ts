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
  /** From applied-markers.txt only: `applied` or `open`. NOT the human verdict. */
  status: string
  /** The human verdict line, which is tracked separately from status and is the reason a
   *  rejected proposal still reads `open`. A page that filters on status alone shows a
   *  decided item forever. */
  verdict: "approved" | "rejected" | "undecided"
  /** Only an auto-applicable LOOP proposal can be applied by the loop. For a HUMAN or REPO
   *  proposal there is nothing to approve: the apply job would write a guidance rule for
   *  work the agent must not do, and then mark the finding applied while the number that
   *  produced it has not moved. */
  autoApplicable: boolean
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
    const auto = /auto-applicable: \*\*True\*\*/.test(b)
    const verdict: Proposal["verdict"] = /\*\*REJECTED by you/.test(b)
      ? "rejected"
      : /\*\*APPROVED by you/.test(b)
        ? "approved"
        : "undecided"
    out.push({
      severity: head[1],
      id: head[2],
      status: head[3],
      verdict,
      autoApplicable: auto,
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

/** Verdicts from approvals.txt, which is the file the human actually writes.
 *
 * PROPOSALS.md carries a rendered verdict line too, but it is only rewritten when
 * propose.py runs -- every six hours. Reading the verdict from there made Dismiss look
 * like it had done nothing for up to six hours after it had in fact been recorded, which
 * is indistinguishable from a broken button. */
export function verdicts(): { approved: Set<string>; rejected: Set<string> } {
  const approved = new Set<string>()
  const rejected = new Set<string>()
  const raw = readText("approvals.txt")
  if (isUnread(raw)) return { approved, rejected }
  for (const line of raw.split("\n")) {
    const t = line.trim()
    if (!t || t.startsWith("#")) continue
    const m = t.match(/^(approve|reject)\s+(\S+)/i)
    if (!m) continue
    ;(m[1].toLowerCase() === "approve" ? approved : rejected).add(m[2])
  }
  return { approved, rejected }
}

export function snapshot(): Snapshot {
  const proposalsMd = readText("PROPOSALS.md")
  let proposals: Proposal[] | Unread
  let computed: string | null = null
  if (isUnread(proposalsMd)) {
    proposals = proposalsMd
  } else {
    const live = verdicts()
    proposals = parseProposals(proposalsMd).map((p) => ({
      ...p,
      // approvals.txt wins over the rendered line: it is what the human wrote, and it is
      // current the instant they write it.
      verdict: live.rejected.has(p.id)
        ? ("rejected" as const)
        : live.approved.has(p.id)
          ? ("approved" as const)
          : p.verdict,
    }))
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
