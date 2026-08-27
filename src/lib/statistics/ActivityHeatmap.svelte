<script>
  import { getGameDay } from '../utils'

  export let sessions = []

  const DAY_MS = 24 * 60 * 60 * 1000

  function makeCells(items) {
    const activityByDay = new Map()
    for (const session of items) {
      const activity = activityByDay.get(session.day) || { minutes: 0, sessions: 0 }
      activity.minutes += session.durationSec / 60
      activity.sessions++
      activityByDay.set(session.day, activity)
    }

    const end = new Date()
    end.setHours(12, 0, 0, 0)
    const mondayOffset = (end.getDay() + 6) % 7
    const start = new Date(end.getTime() - (52 * 7 + mondayOffset) * DAY_MS)

    return Array.from({ length: 53 * 7 }, (_, index) => {
      const date = new Date(start.getTime() + index * DAY_MS)
      const day = getGameDay(new Date(date).setHours(12, 0, 0, 0))
      const { minutes, sessions } = activityByDay.get(day) || { minutes: 0, sessions: 0 }
      const level = minutes === 0 ? 0 : minutes < 10 ? 1 : minutes < 25 ? 2 : minutes < 50 ? 3 : 4
      return { day, minutes, sessions, level }
    })
  }

  $: cells = makeCells(sessions)
</script>

<div class="overflow-x-auto pb-1">
  <div class="activity-grid min-w-max" aria-label="Training activity for the last year">
    {#each cells as cell (cell.day)}
      <span
        class="activity-cell activity-level-{cell.level}"
        title={`${cell.day}: ${Math.round(cell.minutes)} minutes, ${cell.sessions} session${cell.sessions === 1 ? '' : 's'}`}
        aria-label={`${cell.day}, ${Math.round(cell.minutes)} training minutes, ${cell.sessions} session${cell.sessions === 1 ? '' : 's'}`}
      ></span>
    {/each}
  </div>
</div>

<style>
  .activity-grid {
    display: grid;
    grid-auto-flow: column;
    grid-template-rows: repeat(7, 10px);
    grid-auto-columns: 10px;
    gap: 3px;
  }

  .activity-cell {
    width: 10px;
    height: 10px;
    border-radius: 2px;
    background: color-mix(in oklab, currentColor 10%, transparent);
  }

  .activity-level-1 { background: #86efac; }
  .activity-level-2 { background: #22c55e; }
  .activity-level-3 { background: #15803d; }
  .activity-level-4 { background: #0f766e; }
</style>
