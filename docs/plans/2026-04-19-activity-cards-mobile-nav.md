# Activity Cards Grid + Mobile Nav Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the activity list rows with info cards in a responsive 3-col grid with pagination, and make the sidebar collapse on mobile.

**Architecture:** Add an `ActivityCard` component, update Dashboard to use a grid + page state, and update Layout with a hamburger toggle + overlay drawer for mobile.

**Tech Stack:** React, TypeScript, Tailwind CSS, React Router

---

### Task 1: Create ActivityCard component

**Files:**
- Create: `frontend/src/components/ActivityCard.tsx`

**Step 1: Create the component**

```tsx
import { Link } from 'react-router-dom'

interface Activity {
  id: number
  name: string
  date: string
  type: string
  cleaned_distance_m: number | null
  moving_time_s: number | null
  avg_moving_pace: number | null
}

function formatPace(minPerKm: number | null): string {
  if (!minPerKm) return '—'
  return `${(60 / minPerKm).toFixed(1)} km/h`
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return '—'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function formatDistance(meters: number | null): string {
  if (!meters) return '—'
  return `${(meters / 1000).toFixed(1)} km`
}

export default function ActivityCard({ activity }: { activity: Activity }) {
  return (
    <Link
      to={`/activities/${activity.id}`}
      className="flex flex-col gap-3 bg-slate-800 hover:bg-slate-700 rounded-xl p-4 transition-colors"
    >
      <div>
        <p className="font-medium truncate">{activity.name}</p>
        <p className="text-sm text-slate-400">
          {new Date(activity.date).toLocaleDateString()} · {activity.type}
        </p>
      </div>
      <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-700">
        <div>
          <p className="text-xs text-slate-400">Distance</p>
          <p className="font-medium text-sm">{formatDistance(activity.cleaned_distance_m)}</p>
        </div>
        <div>
          <p className="text-xs text-slate-400">Time</p>
          <p className="font-medium text-sm">{formatDuration(activity.moving_time_s)}</p>
        </div>
        <div>
          <p className="text-xs text-slate-400">Pace</p>
          <p className="font-medium text-sm">{formatPace(activity.avg_moving_pace)}</p>
        </div>
      </div>
    </Link>
  )
}
```

**Step 2: Commit**

```bash
git add frontend/src/components/ActivityCard.tsx
git commit -m "feat: add ActivityCard component"
```

---

### Task 2: Update Dashboard to use grid + pagination

**Files:**
- Modify: `frontend/src/pages/Dashboard.tsx`

**Step 1: Add page state and pagination logic**

Replace line 31 area and line 52:
```tsx
const [page, setPage] = useState(0)
const PAGE_SIZE = 9
```

Replace `const recentActivities = activities.slice(0, 5)` with:
```tsx
const totalPages = Math.ceil(activities.length / PAGE_SIZE)
const pagedActivities = activities.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
```

**Step 2: Replace the activity list JSX**

Replace the `<div className="space-y-2">` block (and its contents) with:
```tsx
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
  {pagedActivities.map(a => (
    <ActivityCard key={a.id} activity={a} />
  ))}
</div>
{totalPages > 1 && (
  <div className="flex items-center justify-between mt-4">
    <button
      onClick={() => setPage(p => p - 1)}
      disabled={page === 0}
      className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-sm transition-colors disabled:opacity-30"
    >
      Previous
    </button>
    <span className="text-sm text-slate-400">
      Page {page + 1} of {totalPages}
    </span>
    <button
      onClick={() => setPage(p => p + 1)}
      disabled={page >= totalPages - 1}
      className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-sm transition-colors disabled:opacity-30"
    >
      Next
    </button>
  </div>
)}
```

**Step 3: Add ActivityCard import**

```tsx
import ActivityCard from '../components/ActivityCard'
```

Also update the section header from "Recent Activities" to "Activities".

**Step 4: Remove the now-unused helper functions** (formatPace, formatDuration, formatDistance) from Dashboard.tsx since they've moved to ActivityCard.

**Step 5: Commit**

```bash
git add frontend/src/pages/Dashboard.tsx
git commit -m "feat: activity cards grid with pagination on dashboard"
```

---

### Task 3: Collapsible mobile sidebar in Layout

**Files:**
- Modify: `frontend/src/components/Layout.tsx`
- Modify: `frontend/src/components/NavLink.tsx`

**Step 1: Read NavLink to understand its interface**

Check if NavLink accepts an onClick prop; if not, add one.

**Step 2: Update NavLink to accept optional onClick**

```tsx
interface Props {
  to: string
  label: string
  icon: string
  onClick?: () => void
}

export default function NavLink({ to, label, icon, onClick }: Props) {
  // pass onClick to the underlying <Link> or wrapper
}
```

**Step 3: Update Layout with hamburger + overlay**

```tsx
import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import NavLink from './NavLink'

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const nav = (
    <>
      <div className="px-4 py-3 mb-4">
        <h1 className="text-lg font-bold text-brand">⛰ EffortArc</h1>
      </div>
      <NavLink to="/dashboard" label="Dashboard" icon="📊" onClick={() => setSidebarOpen(false)} />
      <NavLink to="/progress" label="Progress" icon="📈" onClick={() => setSidebarOpen(false)} />
      <NavLink to="/goals" label="Goals" icon="🎯" onClick={() => setSidebarOpen(false)} />
    </>
  )

  return (
    <div className="flex h-screen bg-slate-900 overflow-hidden">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-56 shrink-0 bg-slate-950 border-r border-slate-800 flex-col p-4 gap-1">
        {nav}
      </aside>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/60 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Mobile drawer */}
      <aside
        className={`fixed top-0 left-0 z-30 h-full w-56 bg-slate-950 border-r border-slate-800 flex flex-col p-4 gap-1 transition-transform duration-200 md:hidden ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {nav}
      </aside>

      <main className="flex-1 overflow-y-auto p-6">
        {/* Mobile hamburger */}
        <div className="flex items-center gap-3 mb-4 md:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 transition-colors"
            aria-label="Open menu"
          >
            <span className="block w-5 h-0.5 bg-slate-300 mb-1" />
            <span className="block w-5 h-0.5 bg-slate-300 mb-1" />
            <span className="block w-5 h-0.5 bg-slate-300" />
          </button>
          <h1 className="text-lg font-bold text-brand md:hidden">⛰ EffortArc</h1>
        </div>
        <Outlet />
      </main>
    </div>
  )
}
```

**Step 4: Commit**

```bash
git add frontend/src/components/Layout.tsx frontend/src/components/NavLink.tsx
git commit -m "feat: collapsible mobile sidebar with overlay"
```

---

### Task 4: Verify in browser

**Step 1: Start dev server**
```bash
cd frontend && npm run dev
```

**Step 2: Check desktop** — 3-col activity grid, pagination controls, sidebar visible

**Step 3: Check mobile** (resize to <768px) — sidebar hidden, hamburger visible, tap opens drawer, tap nav link closes it

**Step 4: Check tablet** (~640px) — 2-col grid
