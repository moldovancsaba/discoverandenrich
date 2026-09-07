import { NextResponse } from "next/server"
import { snapshot } from "@/lib/openclaw"

// Always fresh. This reads files a cron rewrites every few minutes, and a cached answer
// would be a stale report presented as a current one -- the exact failure this page exists
// to end.
export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET() {
  return NextResponse.json(snapshot())
}
