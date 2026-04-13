import Link from "next/link"

export default function Home() {
  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-green-50 px-6">
      <main className="flex flex-col items-center gap-8 text-center">
        <div className="flex flex-col items-center gap-2">
          <span className="text-5xl">&#9971;</span>
          <h1 className="text-4xl font-bold tracking-tight text-green-900">
            SuperDay
          </h1>
          <p className="text-lg text-green-700">
            Annual Golf Tournament
          </p>
        </div>

        <div className="flex flex-col gap-3 w-full max-w-xs">
          <div className="rounded-xl bg-white p-6 shadow-sm border border-green-200">
            <p className="text-sm font-medium text-green-800">
              3 Rounds &middot; 3 Formats &middot; 1 Champion
            </p>
          </div>

          <Link
            href="/setup"
            className="block w-full rounded-xl bg-green-700 py-4 text-base font-semibold text-white text-center shadow-sm hover:bg-green-800 transition-colors"
          >
            Set Up Tournament
          </Link>
        </div>

        <p className="text-sm text-green-600 max-w-xs">
          Live scoring and leaderboard coming soon.
        </p>
      </main>
    </div>
  )
}
