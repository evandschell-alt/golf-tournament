"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

type BottomNavProps = {
  tournamentId: string
  teamId?: string | null
}

const homeIcon = (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
    <path d="M11.47 3.841a.75.75 0 011.06 0l8.69 8.69a.75.75 0 101.06-1.061l-8.689-8.69a2.25 2.25 0 00-3.182 0l-8.69 8.69a.75.75 0 001.061 1.06l8.69-8.689z" />
    <path d="M12 5.432l8.159 8.159c.03.03.06.058.091.086v6.198c0 1.035-.84 1.875-1.875 1.875H15a.75.75 0 01-.75-.75v-4.5a.75.75 0 00-.75-.75h-3a.75.75 0 00-.75.75V21a.75.75 0 01-.75.75H5.625a1.875 1.875 0 01-1.875-1.875v-6.198a2.29 2.29 0 00.091-.086L12 5.432z" />
  </svg>
)

const scoresIcon = (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
    <path d="M21.731 2.269a2.625 2.625 0 00-3.712 0l-1.157 1.157 3.712 3.712 1.157-1.157a2.625 2.625 0 000-3.712zM19.513 8.199l-3.712-3.712-8.4 8.4a5.25 5.25 0 00-1.32 2.214l-.8 2.685a.75.75 0 00.933.933l2.685-.8a5.25 5.25 0 002.214-1.32l8.4-8.4z" />
    <path d="M5.25 5.25a3 3 0 00-3 3v10.5a3 3 0 003 3h10.5a3 3 0 003-3V13.5a.75.75 0 00-1.5 0v5.25a1.5 1.5 0 01-1.5 1.5H5.25a1.5 1.5 0 01-1.5-1.5V8.25a1.5 1.5 0 011.5-1.5h5.25a.75.75 0 000-1.5H5.25z" />
  </svg>
)

const cardIcon = (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
    <path fillRule="evenodd" d="M1.5 5.625c0-1.036.84-1.875 1.875-1.875h17.25c1.035 0 1.875.84 1.875 1.875v12.75c0 1.035-.84 1.875-1.875 1.875H3.375A1.875 1.875 0 011.5 18.375V5.625zM21 9.375A.375.375 0 0020.625 9h-7.5a.375.375 0 00-.375.375v1.5c0 .207.168.375.375.375h7.5a.375.375 0 00.375-.375v-1.5zm0 3.75a.375.375 0 00-.375-.375h-7.5a.375.375 0 00-.375.375v1.5c0 .207.168.375.375.375h7.5a.375.375 0 00.375-.375v-1.5zm0 3.75a.375.375 0 00-.375-.375h-7.5a.375.375 0 00-.375.375v1.5c0 .207.168.375.375.375h7.5a.375.375 0 00.375-.375v-1.5zM10.875 18.75a.375.375 0 00.375-.375v-1.5a.375.375 0 00-.375-.375h-7.5a.375.375 0 00-.375.375v1.5c0 .207.168.375.375.375h7.5zM3.375 15h7.5a.375.375 0 00.375-.375v-1.5a.375.375 0 00-.375-.375h-7.5a.375.375 0 00-.375.375v1.5c0 .207.168.375.375.375zm0-3.75h7.5a.375.375 0 00.375-.375v-1.5A.375.375 0 0010.875 9h-7.5A.375.375 0 003 9.375v1.5c0 .207.168.375.375.375z" clipRule="evenodd" />
  </svg>
)

const boardIcon = (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
    <path fillRule="evenodd" d="M5.166 2.621v.858c-1.035.148-2.059.33-3.071.543a.75.75 0 00-.584.859 6.753 6.753 0 006.138 5.6 6.73 6.73 0 002.743 1.346A6.707 6.707 0 019.279 15H8.54c-1.036 0-1.875.84-1.875 1.875V19.5h-.75a.75.75 0 000 1.5h12.75a.75.75 0 000-1.5h-.75v-2.625c0-1.036-.84-1.875-1.875-1.875h-.739a6.707 6.707 0 01-1.112-3.173 6.73 6.73 0 002.743-1.347 6.753 6.753 0 006.139-5.6.75.75 0 00-.585-.858 47.077 47.077 0 00-3.07-.543V2.62a.75.75 0 00-.658-.744 49.22 49.22 0 00-6.093-.377c-2.063 0-4.096.128-6.093.377a.75.75 0 00-.657.744zm0 2.629c0 3.047 1.791 5.313 4.334 5.95a.75.75 0 01.25 1.371A5.21 5.21 0 017.5 17.5v2h9v-2a5.21 5.21 0 01-2.25-4.929.75.75 0 01.25-1.372c2.543-.636 4.334-2.902 4.334-5.95V3.677c-1.906-.246-3.868-.377-5.834-.377-1.966 0-3.928.131-5.834.377v1.573z" clipRule="evenodd" />
  </svg>
)

type Tab = {
  label: string
  href?: string
  hrefFn?: (tournamentId: string, teamId?: string) => string
  icon: React.ReactNode
  match: (path: string) => boolean
  requiresTeam?: boolean
}

const allTabs: Tab[] = [
  {
    label: "Home",
    href: "/",
    icon: homeIcon,
    match: (path: string) => path === "/",
  },
  {
    label: "Scores",
    hrefFn: (id: string, teamId?: string) => `/tournament/${id}/score?team=${teamId}`,
    icon: scoresIcon,
    match: (path: string) => path.includes("/score"),
    requiresTeam: true,
  },
  {
    label: "Card",
    hrefFn: (id: string, teamId?: string) => `/tournament/${id}/scorecard?team=${teamId}`,
    icon: cardIcon,
    match: (path: string) => path.includes("/scorecard"),
    requiresTeam: true,
  },
  {
    label: "Board",
    hrefFn: (id: string) => `/tournament/${id}/leaderboard`,
    icon: boardIcon,
    match: (path: string) => path.includes("/leaderboard"),
  },
]

export default function BottomNav({ tournamentId, teamId }: BottomNavProps) {
  const pathname = usePathname()

  // Filter tabs: only show team-specific tabs when a team is selected
  const visibleTabs = allTabs.filter((tab) => !tab.requiresTeam || teamId)

  return (
    <nav className="sticky bottom-0 z-10 bg-white border-t border-green-200 shadow-[0_-2px_8px_rgba(0,0,0,0.06)]">
      <div className="max-w-md mx-auto flex">
        {visibleTabs.map((tab) => {
          const href = tab.href || tab.hrefFn!(tournamentId, teamId || undefined)
          const active = tab.match(pathname)

          return (
            <Link
              key={tab.label}
              href={href}
              className={`flex-1 flex flex-col items-center gap-0.5 py-2 text-xs font-medium transition-colors ${
                active
                  ? "text-green-700"
                  : "text-gray-400 hover:text-green-600"
              }`}
            >
              {tab.icon}
              {tab.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
