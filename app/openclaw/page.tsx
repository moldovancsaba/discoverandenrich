"use client"

import { useCallback, useEffect, useState } from "react"

type Unread = { unread: string }
const isUnread = (v: unknown): v is Unread =>
  !!v && typeof v === "object" && "unread" in (v as object)

type Run = { at: string; delivered: number | null; secs?: number; output?: string; tail?: string }
type Job = { app: string; client: string; operation: string; enabled: boolean }
type Proposal = {
  id: string; severity: string; scope: string; status: string
  verdict: "approved" | "rejected" | "undecided"
  autoApplicable: boolean
  finding: string; why: string; action: string
}

/** Where the work for a HUMAN-scoped proposal actually happens. There is nothing for the
 *  loop to apply, so the honest button is a link, not an Approve. */
const WORK_LINK: Record<string, { href: string; label: string }> = {
  "cogmap-review-rate": { href: "https://salesleadgenerator.vercel.app/", label: "Review cogmap leads" },
  "dvsc-review-rate": { href: "https://salesleadgenerator.vercel.app/", label: "Review dvsc leads" },
  "cogmap-duplicates": { href: "https://salesleadgenerator.vercel.app/admin/duplicates", label: "cogmap duplicates" },
  "seyu-duplicates": { href: "https://salesleadgenerator.vercel.app/admin/duplicates", label: "seyu duplicates" },
  "NYC-duplicates": { href: "https://classscout.ai/nyc", label: "classscout NYC" },
  "padel-africa-fabricated-urls": { href: "https://padel-africa.vercel.app/", label: "padel-africa" },
}
type Snapshot = {
  workspace: string
  readAt: string
  jobs: { jobs: Record<string, Job> } | Unread
  runs: Record<string, Run[]> | Unread
  alerts: { checked_at: string; failed: string[]; alerts: string[] } | Unread
  quality: { tenants: Record<string, any> } | Unread
  quarantine: { held: unknown[] } | Unread
  proposals: Proposal[] | Unread
  proposalsComputed: string | null
}

function dropTally(run: Run): [string, number][] {
  const text = run.output || run.tail || ""
  const m = text.match(/\(([^()]*\b\d+\b[^()]*)\)\s*$/m)
  if (!m) return []
  const out: [string, number][] = []
  for (const part of m[1].split(",")) {
    const hit = part.trim().match(/^(.+?)\s+(\d+)$/)
    if (hit) out.push([hit[1].trim(), Number(hit[2])])
  }
  return out.sort((a, b) => b[1] - a[1])
}

const targetOf = (run: Run) =>
  (run.output || "").match(/^\s*targeting(?: the scarcest)?:? ([^(\n]+)/m)?.[1].trim() ?? null

const ago = (iso: string) => {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (!Number.isFinite(mins)) return "—"
  if (mins < 60) return `${mins}m ago`
  const h = Math.floor(mins / 60)
  return h < 48 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`
}

/** "we could not read this" is shown as itself, never as an empty section that reads like
 *  a clean result. That confusion is the single most repeated fault in this pipeline. */
function Unreadable({ what }: { what: Unread }) {
  return (
    <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
      NOT READ — {what.unread}
    </div>
  )
}

export default function OpenClawAdmin() {
  const [s, setS] = useState<Snapshot | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/openclaw/state", { cache: "no-store" })
      if (!r.ok) throw new Error(`state: HTTP ${r.status}`)
      setS(await r.json())
      setErr(null)
    } catch (e) {
      setErr((e as Error).message)
    }
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(load, 60_000)
    return () => clearInterval(t)
  }, [load])

  async function decide(id: string, verdict: "approve" | "reject") {
    setBusy(id)
    try {
      const r = await fetch("/api/openclaw/decide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, verdict }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`)
      await load()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  if (err && !s) return <main className="p-8 text-red-700">Could not load state: {err}</main>
  if (!s) return <main className="p-8 text-gray-500">Reading the workspace…</main>

  const jobs = isUnread(s.jobs) ? null : s.jobs.jobs
  const runs = isUnread(s.runs) ? null : s.runs
  const proposals = isUnread(s.proposals) ? null : s.proposals
  // status comes from applied-markers.txt and does NOT change when you decide. Filtering on
  // it alone kept a rejected proposal in this list forever, which is how a queue stops
  // meaning anything.
  const open = proposals?.filter((p) => p.status === "open" && p.verdict === "undecided") ?? []
  const decided = proposals?.filter((p) => p.verdict !== "undecided" && p.status === "open") ?? []

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <header className="mb-6 flex items-baseline justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">OpenClaw</h1>
            <p className="text-sm text-gray-500">
              {s.workspace} · read {ago(s.readAt)}
            </p>
          </div>
          <button onClick={load} className="rounded border px-3 py-1 text-sm hover:bg-white">
            Refresh
          </button>
        </header>

        {err && <div className="mb-4 rounded bg-red-50 px-3 py-2 text-sm text-red-800">{err}</div>}

        {/* ---------------------------------------------------------------- alerts */}
        <section className="mb-8">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">Alerts</h2>
          {isUnread(s.alerts) ? (
            <Unreadable what={s.alerts} />
          ) : s.alerts.alerts.length === 0 && s.alerts.failed.length === 0 ? (
            <div className="rounded border bg-white px-3 py-2 text-sm text-gray-600">
              None. Checked {ago(s.alerts.checked_at)}.
            </div>
          ) : (
            <ul className="space-y-2">
              {s.alerts.failed.map((f) => (
                <li key={f} className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">
                  FAILED CHECK — {f}
                </li>
              ))}
              {s.alerts.alerts.map((a) => (
                <li key={a} className="rounded border border-orange-300 bg-orange-50 px-3 py-2 text-sm text-orange-900">
                  {a}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ------------------------------------------------------ awaiting a decision */}
        <section className="mb-8">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
            Awaiting your decision ({open.length})
            {s.proposalsComputed && (
              <span className="ml-2 font-normal normal-case text-gray-400">
                computed {s.proposalsComputed}
              </span>
            )}
          </h2>
          {isUnread(s.proposals) ? (
            <Unreadable what={s.proposals} />
          ) : open.length === 0 ? (
            <div className="rounded border bg-white px-3 py-2 text-sm text-gray-600">
              Nothing open.
            </div>
          ) : (
            <ul className="space-y-3">
              {open.map((p) => (
                <li key={p.id} className="rounded border bg-white p-4">
                  <div className="mb-1 flex items-center gap-2">
                    <span
                      className={`rounded px-1.5 py-0.5 text-xs font-semibold ${
                        p.severity === "HIGH"
                          ? "bg-red-100 text-red-800"
                          : "bg-yellow-100 text-yellow-800"
                      }`}
                    >
                      {p.severity}
                    </span>
                    <span className="font-mono text-sm text-gray-900">{p.id}</span>
                    <span className="text-xs text-gray-400">{p.scope}</span>
                  </div>
                  <p className="text-sm text-gray-800">{p.finding}</p>
                  {p.action && <p className="mt-1 text-sm text-gray-600">→ {p.action}</p>}

                  {/* What each button DOES. Without this the page offers a decision whose
                      consequence the reader cannot know -- and for a HUMAN-scoped item
                      Approve is actively wrong: the apply job would write a guidance rule
                      for work the agent must never do, then mark the finding applied while
                      the number that produced it has not moved. */}
                  <div className="mt-3 rounded bg-gray-50 p-3">
                    {p.autoApplicable ? (
                      <>
                        <p className="text-xs text-gray-600">
                          <b>Approve</b> → the hourly apply job adds this as a rule in{" "}
                          <code>TOOLS.md</code> under “Loop improvements”, marks it applied,
                          and it leaves this list. The loop follows it from then on.
                          <br />
                          <b>Reject</b> → recorded as your decision; never applied, and it
                          stops being re-proposed.
                        </p>
                        <div className="mt-2 flex gap-2">
                          <button
                            disabled={busy === p.id}
                            onClick={() => decide(p.id, "approve")}
                            className="rounded bg-gray-900 px-3 py-1 text-sm text-white disabled:opacity-40"
                          >
                            Approve
                          </button>
                          <button
                            disabled={busy === p.id}
                            onClick={() => decide(p.id, "reject")}
                            className="rounded border px-3 py-1 text-sm disabled:opacity-40"
                          >
                            Reject
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <p className="text-xs text-gray-600">
                          <b>Nothing here can be approved.</b> This is {p.scope}-scoped: the
                          work is yours, not the loop’s, and there is no change for it to
                          apply. Approving would only write a rule telling the agent to do
                          something it must not do, then mark this finding “applied” while
                          the number that produced it stayed exactly the same.
                          <br />
                          <b>Dismiss</b> → records your decision and stops it being
                          re-proposed. Use it when you have done the work, or decided not to.
                          The measurement will raise it again if it worsens.
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          {WORK_LINK[p.id] && (
                            <a
                              href={WORK_LINK[p.id].href}
                              target="_blank"
                              rel="noreferrer"
                              className="rounded bg-gray-900 px-3 py-1 text-sm text-white"
                            >
                              Do it → {WORK_LINK[p.id].label}
                            </a>
                          )}
                          <button
                            disabled={busy === p.id}
                            onClick={() => decide(p.id, "reject")}
                            className="rounded border px-3 py-1 text-sm disabled:opacity-40"
                          >
                            Dismiss
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Decided, but the measurement still stands. Shown rather than hidden: a rejected
            finding whose number has not moved is worth seeing, and hiding it is how a
            report starts flattering the reader. */}
        {decided.length > 0 && (
          <section className="mb-8">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
              Decided by you, still measured ({decided.length})
            </h2>
            <ul className="space-y-1">
              {decided.map((p) => (
                <li key={p.id} className="rounded border bg-white px-3 py-2 text-sm">
                  <span
                    className={`mr-2 rounded px-1.5 py-0.5 text-xs ${
                      p.verdict === "rejected"
                        ? "bg-gray-200 text-gray-700"
                        : "bg-green-100 text-green-800"
                    }`}
                  >
                    {p.verdict}
                  </span>
                  <span className="font-mono text-xs">{p.id}</span>
                  <span className="ml-2 text-gray-600">{p.finding}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ------------------------------------------------------------------- jobs */}
        <section className="mb-8">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
            Jobs — last run, what it delivered, and why it dropped the rest
          </h2>
          {!jobs || !runs ? (
            <Unreadable what={(isUnread(s.jobs) ? s.jobs : s.runs) as Unread} />
          ) : (
            <div className="overflow-x-auto rounded border bg-white">
              <table className="w-full text-sm">
                <thead className="bg-gray-100 text-left text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-3 py-2">job</th>
                    <th className="px-3 py-2">last run</th>
                    <th className="px-3 py-2">delivered</th>
                    <th className="px-3 py-2">targeting</th>
                    <th className="px-3 py-2">dropped</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(jobs)
                    .filter(([, j]) => j.enabled)
                    .map(([id]) => {
                      const rs = runs[id] || []
                      const last = rs[rs.length - 1]
                      return (
                        <tr key={id} className="border-t align-top">
                          <td className="px-3 py-2 font-mono text-xs">{id}</td>
                          <td className="px-3 py-2 text-gray-600">
                            {last ? ago(last.at) : "never"}
                          </td>
                          <td className="px-3 py-2">
                            {!last ? (
                              "—"
                            ) : last.delivered === null ? (
                              <span className="text-amber-700">not measured</span>
                            ) : (
                              <span className={last.delivered ? "font-semibold" : "text-gray-400"}>
                                {last.delivered}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-gray-600">
                            {last ? (targetOf(last) ?? "—") : "—"}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex flex-wrap gap-1">
                              {last &&
                                dropTally(last).map(([reason, n]) => (
                                  <span
                                    key={reason}
                                    className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-700"
                                  >
                                    {reason} {n}
                                  </span>
                                ))}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ---------------------------------------------------------------- quality */}
        <section className="mb-8">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
            Per client
          </h2>
          {isUnread(s.quality) ? (
            <Unreadable what={s.quality} />
          ) : (
            <div className="overflow-x-auto rounded border bg-white">
              <table className="w-full text-sm">
                <thead className="bg-gray-100 text-left text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-3 py-2">client</th>
                    <th className="px-3 py-2">records</th>
                    <th className="px-3 py-2">no contact</th>
                    <th className="px-3 py-2">dead links</th>
                    <th className="px-3 py-2">placeholders</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(s.quality.tenants).map(([t, f]: [string, any]) => (
                    <tr key={t} className="border-t">
                      <td className="px-3 py-2 font-medium">{t}</td>
                      <td className="px-3 py-2">{f.records}</td>
                      <td className="px-3 py-2">
                        {f.contacts_exposed === false ? (
                          <span className="text-gray-400">NOT CHECKED — not exposed</span>
                        ) : (
                          f.no_contact_count ?? 0
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {(f.deadlinks?.length ?? 0)} of {f.deadlink_probed ?? 0}
                      </td>
                      <td className="px-3 py-2">{f.placeholder_count ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
            Quarantine
          </h2>
          {isUnread(s.quarantine) ? (
            <Unreadable what={s.quarantine} />
          ) : (
            <div className="rounded border bg-white px-3 py-2 text-sm text-gray-700">
              {s.quarantine.held.length} record(s) held. A held record is never enriched,
              updated or published, and clearing a hold is a human act.
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
