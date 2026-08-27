import { writable } from 'svelte/store'
import { addGame, getLastRecentGame, getTrainingSummarySince4AM } from '../lib/gamedb'
import { formatSeconds } from '../lib/utils'

const loadAnalytics = async () => {
  const [lastGame, daily] = await Promise.all([
    getLastRecentGame(),
    getTrainingSummarySince4AM(),
  ])

  return {
    lastGame,
    playTime: daily.playTime > 0 ? formatSeconds(daily.playTime) : null,
    sessionCount: daily.sessionCount,
  }
}

const loadDailyAnalytics = async () => {
  const daily = await getTrainingSummarySince4AM()
  return {
    playTime: daily.playTime > 0 ? formatSeconds(daily.playTime) : null,
    sessionCount: daily.sessionCount,
  }
}

const createAnalyticsStore = () => {
  const { subscribe, set, update } = writable({})

  loadAnalytics().then(analytics => set(analytics))
  return {
    subscribe,
    refreshDaily: async () => {
      const daily = await loadDailyAnalytics()
      update(current => ({ ...current, ...daily }))
    },
    scoreTrials: async (gameInfo, scoresheet, status) => {
      const scores = {}
      for (const tag of gameInfo.tags) {
        scores[tag] = { hits: 0, misses: 0 }
      }

      for (const answers of scoresheet) {
        for (const tag of gameInfo.tags) {
          if (tag in answers) {
            if (answers[tag]) {
              scores[tag].hits++
            } else {
              scores[tag].misses++
            }
          }
        }
      }

      await addGame({
        ...gameInfo,
        scores,
        completedTrials: scoresheet.length,
        status
      })
      set(await loadAnalytics())
    },

    scoreTallyTrials: async (gameInfo, scoresheet, status) => {
      const scores = { tally: { hits: 0, misses: 0 } }

      scores.tally.hits = scoresheet.filter(answers => answers.success && answers.count > 0).length
      scores.tally.possible = scoresheet.filter(answers => answers.count > 0 || ('success' in answers && answers.success === false)).length

      await addGame({
        ...gameInfo,
        scores,
        completedTrials: scoresheet.length,
        status,
      })
      set(await loadAnalytics())
    }
  }
}

export const analytics = createAnalyticsStore()
