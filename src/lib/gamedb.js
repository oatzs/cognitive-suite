import { getGameDay, getTruncatedDate } from "./utils"
import { createSessionId } from "./sessionId"
const DB_NAME = "QuadBoxNBack"
const DB_VERSION = 3
const STORE_NAME = "games"

const openDB = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = (event) => {
      const db = event.target.result
      let store
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        store = db.createObjectStore(STORE_NAME, {
          keyPath: "id",
          autoIncrement: true,
        })
      } else {
        store = request.transaction.objectStore(STORE_NAME)
      }

      if (!store.indexNames.contains("status")) {
        store.createIndex("status", "status")
      }
      if (!store.indexNames.contains("timestamp")) {
        store.createIndex("timestamp", "timestamp")
      }
      if (!store.indexNames.contains("status_timestamp")) {
        store.createIndex("status_timestamp", ["status", "timestamp"])
      }
      if (!store.indexNames.contains("source_session")) {
        store.createIndex("source_session", ["source", "sourceSessionId"], { unique: true })
      }
      if (!store.indexNames.contains("session_id")) {
        store.createIndex("session_id", "sessionId", { unique: true })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function addGame(gameInfo) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite")
    tx.objectStore(STORE_NAME).add({
      ...gameInfo,
      sessionId: gameInfo.sessionId || createSessionId(),
    })
    tx.oncomplete = () => {
      db.close()
      resolve()
    }
    tx.onerror = () => {
      db.close()
      reject(tx.error)
    }
    tx.onabort = () => {
      db.close()
      reject(tx.error)
    }
  })
}

export async function addImportedGames(games) {
  if (!Array.isArray(games)) throw new TypeError('Imported games must be an array')
  if (games.length === 0) return 0

  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite")
    const store = tx.objectStore(STORE_NAME)
    let failure

    for (const game of games) {
      const record = { ...game }
      delete record.id
      const request = store.add(record)
      request.onerror = () => {
        failure = request.error
      }
    }

    tx.oncomplete = () => {
      db.close()
      resolve(games.length)
    }
    tx.onerror = () => {
      db.close()
      reject(failure || tx.error || new Error('Could not import sessions'))
    }
    tx.onabort = () => {
      db.close()
      reject(failure || tx.error || new Error('Could not import sessions'))
    }
  })
}

export async function addDocctSession(session) {
  const completedAt = new Date(session.completedAt)
  if (!Number.isFinite(completedAt.getTime())) return false

  const completedTrials = Math.max(0, Number(session.totalAnswers) || 0)
  const hits = Math.max(0, Number(session.correctCount) || 0)
  const misses = Math.max(0, completedTrials - hits)
  const durationSec = Math.max(0, Number(session.durationSec) || 0)
  const nBack = session.mode === '2-back' ? 2 : session.mode === 'variable' ? 1.5 : 1
  const timestamp = completedAt.getTime()
  const sourceSessionId = session.completedAt
  const record = {
    ...(session.sessionId ? { sessionId: session.sessionId } : {}),
    source: 'docct',
    sourceSessionId,
    timestamp,
    start: timestamp - durationSec * 1000,
    status: 'completed',
    title: `docct ${session.mode}`,
    mode: 'docct',
    variant: session.mode,
    nBack,
    tags: ['answer'],
    scores: { answer: { hits, misses } },
    completedTrials,
    trialTime: Number(session.endingIntervalMs) || 0,
    docct: { ...session },
  }

  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite")
    const store = tx.objectStore(STORE_NAME)
    const existing = store.index("source_session").getKey(['docct', sourceSessionId])
    let added = false

    existing.onsuccess = () => {
      if (existing.result === undefined) {
        store.add(record)
        added = true
      }
    }
    tx.oncomplete = () => {
      db.close()
      resolve(added)
    }
    tx.onerror = () => {
      db.close()
      reject(tx.error)
    }
    tx.onabort = () => {
      db.close()
      reject(tx.error)
    }
  })
}

export async function addSyllogimousSession(session) {
  const completedAt = new Date(session.completedAt)
  const startedAt = new Date(session.startedAt)
  if (!Number.isFinite(completedAt.getTime()) || !Number.isFinite(startedAt.getTime())) return false
  if (startedAt > completedAt) return false

  const completedTrials = Math.max(0, Math.floor(Number(session.totalAnswers) || 0))
  if (completedTrials === 0) return false
  const hits = Math.min(completedTrials, Math.max(0, Math.floor(Number(session.correctCount) || 0)))
  const timestamp = completedAt.getTime()
  const startTimestamp = Math.max(timestamp - 86_400_000, startedAt.getTime())
  const durationSec = (timestamp - startTimestamp) / 1000
  const mode = typeof session.mode === 'string' && session.mode ? session.mode.slice(0, 100) : 'mixed'
  const sourceSessionId = typeof session.sessionId === 'string' && session.sessionId
    ? session.sessionId.slice(0, 256)
    : `${startedAt.toISOString()}:${completedAt.toISOString()}`
  const categoryCounts = {}
  for (const [category, count] of Object.entries(session.categoryCounts || {})) {
    const value = Math.max(0, Math.floor(Number(count) || 0))
    if (!category || category.length > 100 || ['__proto__', 'constructor', 'prototype'].includes(category)) continue
    categoryCounts[category] = value
  }
  if (Object.values(categoryCounts).reduce((sum, count) => sum + count, 0) !== completedTrials) {
    for (const category of Object.keys(categoryCounts)) delete categoryCounts[category]
    categoryCounts[mode] = completedTrials
  }
  const record = {
    sessionId: sourceSessionId,
    source: 'syllogimous',
    sourceSessionId,
    timestamp,
    start: startTimestamp,
    status: 'completed',
    title: `syllogimous ${mode}`,
    mode: 'syllogimous',
    variant: mode,
    tags: ['answer'],
    scores: { answer: { hits, misses: completedTrials - hits } },
    completedTrials,
    syllogimous: {
      sessionId: sourceSessionId,
      startedAt: new Date(startTimestamp).toISOString(),
      completedAt: completedAt.toISOString(),
      durationSec,
      mode,
      correctCount: hits,
      totalAnswers: completedTrials,
      averageResponseTimeMs: Math.min(86_400_000, Math.max(0, Number(session.averageResponseTimeMs) || 0)),
      averagePremises: Math.min(1_000_000, Math.max(0, Number(session.averagePremises) || 0)),
      categoryCounts,
    },
  }

  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite")
    const store = tx.objectStore(STORE_NAME)
    const existing = store.index("source_session").getKey(['syllogimous', sourceSessionId])
    let added = false

    existing.onsuccess = () => {
      if (existing.result === undefined) {
        store.add(record)
        added = true
      }
    }
    tx.oncomplete = () => {
      db.close()
      resolve(added)
    }
    tx.onerror = () => {
      db.close()
      reject(tx.error)
    }
    tx.onabort = () => {
      db.close()
      reject(tx.error)
    }
  })
}

export async function getLastRecentGame() {
  const db = await openDB()
  const tx = db.transaction(STORE_NAME, "readonly")
  const store = tx.objectStore(STORE_NAME)
  const index = store.index("timestamp")

  const twoHoursAgo = Date.now() - 120 * 60 * 1000
  const keyRange = IDBKeyRange.lowerBound(twoHoursAgo)

  return new Promise((resolve, reject) => {
    const cursorRequest = index.openCursor(keyRange, "prev")

    cursorRequest.onsuccess = (event) => {
      const cursor = event.target.result
      const isQuadBox = cursor && (!cursor.value.source || cursor.value.source === 'quad-box')
      if (cursor && (cursor.value.status === "tombstone" || !isQuadBox)) {
        cursor.continue()
      } else if (cursor) {
        addScoreMetadata(cursor.value)
        resolve(cursor.value)
      } else {
        resolve(null)
      }
      db.close()
    }

    cursorRequest.onerror = () => {
      db.close()
      reject(cursorRequest.error)
    }
  })
}

export async function getAllCompletedGames() {
  const db = await openDB()
  const tx = db.transaction(STORE_NAME, "readonly")
  const store = tx.objectStore(STORE_NAME)
  const index = store.index("status_timestamp")

  const games = []

  return new Promise((resolve, reject) => {
    const keyRange = IDBKeyRange.bound(["completed", 0], ["completed", Infinity])
    const cursorRequest = index.openCursor(keyRange, "prev")

    cursorRequest.onsuccess = (event) => {
      const cursor = event.target.result
      if (cursor) {
        addScoreMetadata(cursor.value)
        games.push(cursor.value)
        cursor.continue()
      } else {
        db.close()
        resolve(games)
      }
    }

    cursorRequest.onerror = () => {
      db.close()
      reject(cursorRequest.error)
    }
  })
}

export async function deleteGamesBySource(source) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite")
    const store = tx.objectStore(STORE_NAME)
    const cursorRequest = store.openCursor()
    let deleted = 0

    cursorRequest.onsuccess = (event) => {
      const cursor = event.target.result
      if (!cursor) return
      const recordSource = cursor.value.source || 'quad-box'
      if (recordSource === source) {
        cursor.delete()
        deleted++
      }
      cursor.continue()
    }
    tx.oncomplete = () => {
      db.close()
      resolve(deleted)
    }
    tx.onerror = () => {
      db.close()
      reject(tx.error)
    }
    tx.onabort = () => {
      db.close()
      reject(tx.error)
    }
  })
}

export async function getLast48HoursGames() {
  return await getGamesTimeRange(new Date(Date.now() - 48 * 60 * 60 * 1000), new Date(Date.now() + 24 * 60 * 60 * 1000))
}

export async function getLastMonthGames() {
  return await getGamesTimeRange(new Date(Date.now() - 28 * 24 * 60 * 60 * 1000), new Date(Date.now() + 24 * 60 * 60 * 1000))
}

export async function getGamesTimeRange(start, end) {
  const db = await openDB()
  const tx = db.transaction(STORE_NAME, "readonly")
  const store = tx.objectStore(STORE_NAME)
  const index = store.index("timestamp")

  const games = []

  return new Promise((resolve, reject) => {
    const keyRange = IDBKeyRange.bound(start.getTime(), end.getTime())
    const cursorRequest = index.openCursor(keyRange, "prev")

    cursorRequest.onsuccess = (event) => {
      const cursor = event.target.result
      if (cursor) {
        addScoreMetadata(cursor.value)
        games.push(cursor.value)
        cursor.continue()
      } else {
        db.close()
        resolve(games)
      }
    }

    cursorRequest.onerror = () => {
      db.close()
      reject(cursorRequest.error)
    }
  })
}

export async function getTrainingSummarySince4AM() {
  const db = await openDB()
  const tx = db.transaction(STORE_NAME, "readonly")
  const store = tx.objectStore(STORE_NAME)
  const index = store.index("timestamp")

  const now = new Date()
  const fourAM = new Date(now)
  fourAM.setHours(4, 0, 0, 0)
  if (now < fourAM) {
    fourAM.setDate(fourAM.getDate() - 1)
  }

  const lowerBound = fourAM.getTime()
  const summary = { playTime: 0, sessionCount: 0 }

  return new Promise((resolve, reject) => {
    const range = IDBKeyRange.lowerBound(lowerBound)
    const cursorRequest = index.openCursor(range)

    cursorRequest.onsuccess = (event) => {
      const cursor = event.target.result
      if (cursor) {
        if (cursor.value.status === 'completed') {
          addScoreMetadata(cursor.value)
          summary.playTime += cursor.value.elapsedSeconds
          summary.sessionCount++
        }
        cursor.continue()
      } else {
        db.close()
        resolve(summary)
      }
    }

    cursorRequest.onerror = () => {
      db.close()
      reject(cursorRequest.error)
    }
  })
}

export async function getPlayTimeSince4AM() {
  return (await getTrainingSummarySince4AM()).playTime
}

export const getYearOfPlayTime = async () => {
  const db = await openDB()
  const tx = db.transaction(STORE_NAME, "readonly")
  const store = tx.objectStore(STORE_NAME)
  const index = store.index("timestamp")

  const now = new Date()
  const oneYearAgo = new Date(now)
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)
  oneYearAgo.setHours(4, 0, 0, 0)

  const lowerBound = oneYearAgo.getTime()
  let games = {}

  return new Promise((resolve, reject) => {
    const range = IDBKeyRange.lowerBound(lowerBound)
    const cursorRequest = index.openCursor(range)

    cursorRequest.onsuccess = (event) => {
      const cursor = event.target.result
      if (cursor) {
        if (cursor.value.status === 'completed') {
          addScoreMetadata(cursor.value)
          const day = getGameDay(cursor.value.timestamp)
          if (!games[day]) {
            games[day] = 0
          }
          games[day] += cursor.value.elapsedSeconds / 60
        }
        cursor.continue()
      } else {
        db.close()
        resolve(games)
      }
    }

    cursorRequest.onerror = () => {
      db.close()
      reject(cursorRequest.error)
    }
  })
}


const addScoreMetadata = (game) => {
  if (game.status === 'tombstone') {
    return game
  }
  game.source = game.source || 'quad-box'
  game.variant = game.variant || game.title || game.mode || 'unknown'
  if ('start' in game) {
    game.elapsedSeconds = (game.timestamp - game.start) / 1000
  } else {
    game.elapsedSeconds = game.trialTime * game.completedTrials / 1000
  }
  game.dayTimestamp = getTruncatedDate(game.timestamp).getTime()
  game.total = { hits: 0, misses: 0, percent: 0, possible: 0, ncalc: 0 }
  if (game?.mode === 'tally' || game?.scores?.tally) {
    game.total.hits = game.scores.tally.hits
    game.total.possible = game.scores.tally.possible
    game.total.misses = game.scores.tally.possible - game.scores.tally.hits
    game.total.percent = 0
    if (game.scores.tally.hits > 0) {
      game.total.percent = game.scores.tally.hits / game.scores.tally.possible
    }
  } else {
    for (const tag of game.tags || []) {
      if (!game.scores?.[tag]) continue
      game.total.hits += game.scores[tag].hits
      game.total.misses += game.scores[tag].misses
      game.scores[tag].possible = game.scores[tag].hits + game.scores[tag].misses
      game.scores[tag].percent = 0
      if (game.scores[tag].hits > 0) {
        game.scores[tag].percent = game.scores[tag].hits / game.scores[tag].possible
      }
    }
  }

  game.total.possible = game.total.hits + game.total.misses
  if (game.total.hits > 0) {
    game.total.percent = game.total.hits / game.total.possible
  }

  if (Number.isFinite(game.nBack) && game?.mode !== 'tally') {
    game.ncalc = game.nBack + (game.total.percent - 0.5) * 2.7
  }

  if (game?.mode === 'tally') {
    game.total.averageTrialTime = (game.timestamp - game.start) / game.completedTrials
  }
}

export const deleteDB = async () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error("Delete blocked: another tab may be using the database"))
  })
}
