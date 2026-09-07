/**
 * The maintenance this machine can actually do.
 *
 * Every task here is a script that already exists in the OpenClaw workspace, already has a
 * dry-run mode, and already writes its own backup and audit trail. Nothing new is invented
 * and nothing arbitrary can be run: the id is looked up in this table and the argv comes
 * from the table, never from the request. A caller cannot pass a flag, a path or a shell
 * string.
 *
 * WHY THIS EXISTS AT ALL. Several of these writes were blocked in the agent session that
 * built this page, by that session's own permission layer. They are not blocked on this
 * machine — the scripts run fine, and the work is real: 245 verification stamps citing a
 * source for a field that is empty, 21 listings whose website is in a reserved TLD that can
 * never resolve. The page is where a person can run them, see the output, and decide.
 */

export type Task = {
  id: string
  label: string
  /** One line, in the imperative: what running this does to the world. */
  does: string
  argv: string[]
  /** True when this writes to a customer's live database. */
  writes: boolean
  /** The id of the dry-run that should be read first, if there is one. */
  dryRunOf?: string
  timeoutMs: number
}

export const TASKS: Task[] = [
  // ---------------------------------------------------------------- read-only
  {
    id: "status",
    label: "Worker status",
    does: "Show the queue, the lock and the cool-down. Changes nothing.",
    argv: ["worker.py", "status"],
    writes: false,
    timeoutMs: 30_000,
  },
  {
    id: "checks",
    label: "Run every check",
    does: "Run all workspace tests plus the job and worker alerts. Changes nothing.",
    argv: ["run-checks.py", "--quiet"],
    writes: false,
    timeoutMs: 600_000,
  },
  {
    id: "quality",
    label: "Re-measure quality",
    does:
      "Re-audit every client and rewrite QUALITY.md and quality-findings.json. " +
      "Reads the tenants, writes only local report files.",
    argv: ["quality.py"],
    writes: false,
    timeoutMs: 600_000,
  },
  {
    id: "propose",
    label: "Regenerate proposals",
    does:
      "Rebuild PROPOSALS.md from the latest measurements and your recorded verdicts. " +
      "Run this after dismissing something to see the list settle.",
    argv: ["propose.py"],
    writes: false,
    timeoutMs: 120_000,
  },

  // --------------------------------------------------- dry runs of real writes
  {
    id: "retract-dry",
    label: "False verification stamps — dry run",
    does:
      "Read classscout live and report every stamp citing a source for a field that is " +
      "empty or unknown, and every phone in the NANP 555 exchange. Writes nothing.",
    argv: ["retract-false-claims.py"],
    writes: false,
    timeoutMs: 300_000,
  },
  {
    id: "purge-dry",
    label: "Placeholder contacts — dry run",
    does: "Report contact values that are dummy strings rather than contacts. Writes nothing.",
    argv: ["purge-placeholders.py"],
    writes: false,
    timeoutMs: 300_000,
  },

  // ------------------------------------------------------------- live writes
  {
    id: "retract-apply",
    label: "Withdraw the false verification stamps",
    does:
      "Withdraw every false stamp and fabricated phone from classscout, five records at a " +
      "time. Removes only the stamp, never the field's own value; never deletes a record; " +
      "skips anything quarantined; writes each withdrawal to retractions-classscout.json.",
    argv: ["retract-false-claims.py", "--apply", "--rounds", "30"],
    writes: true,
    dryRunOf: "retract-dry",
    timeoutMs: 900_000,
  },
  {
    id: "purge-apply",
    label: "Clear the placeholder contacts",
    does:
      "Blank placeholder contact values on salesleadgenerator, backing up every affected " +
      "record first, then verify by list and report anything that did not take.",
    argv: ["purge-placeholders.py", "--apply"],
    writes: true,
    dryRunOf: "purge-dry",
    timeoutMs: 600_000,
  },

  // ----------------------------------------------------------- housekeeping
  {
    id: "seed",
    label: "Top up the classscout queue",
    does:
      "Seed whichever classscout client's candidate queue is shortest from OpenStreetMap, " +
      "through the forbidden, refused-source, robots and children gates. Writes a local " +
      "queue file only.",
    argv: ["seed-classscout-osm.py", "--auto", "--limit", "15", "--budget", "600"],
    writes: false,
    timeoutMs: 900_000,
  },
]

export const byId = (id: string) => TASKS.find((t) => t.id === id)
