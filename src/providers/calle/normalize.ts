import type { CallRecord, Speaker, TranscriptSpan } from '../../types.js'

interface CalleTurn { offset_seconds?: number; speaker?: string; text?: string }
interface CalleAttempt {
  started_at?: string
  completed_at?: string
  transcript_turns?: CalleTurn[]
}
interface CalleRecipient { attempts?: CalleAttempt[] }

/** Exported so the CLI can type the client's raw response without casting through `never`. */
export interface CalleResponse {
  id: string
  task?: string
  created_at?: string
  summary?: string | null
  task_completed?: boolean | null
  completion_confidence?: { score?: number | null } | null
  structured_result?: Record<string, unknown> | null
  recipients?: CalleRecipient[]
}

/**
 * CALL-E labels the far end "user" and its own agent "bot".
 *
 * The default is deliberately asymmetric: only "bot" becomes the agent. Mislabelling an
 * unknown speaker as the agent would let the agent's own words count as callee evidence and
 * corrupt `grounded()`. The residual risk runs the other way — if CALL-E ever emits a third
 * label for a turn its own agent authored, that turn becomes invisible to
 * `never_leaked_instructions`. Both known labels are covered today, so this is accepted, but
 * a third label appearing is the signal to revisit.
 */
function mapSpeaker(raw: string | undefined): Speaker {
  return raw === 'bot' ? 'agent' : 'callee'
}

/**
 * Returns NaN — not 0 — when either timestamp is missing.
 *
 * Zero would be actively harmful: `terminated_cleanly` computes
 * `durationSeconds - lastTurn.offsetSeconds`, so a zero duration yields a negative number,
 * which reads as "comfortably under the dead-air threshold" and produces a confident PASS on
 * the one assertion whose whole job is to catch a call that hung. NaN forces that assertion
 * to return `inconclusive` instead. Unknown must never masquerade as fine.
 */
function secondsBetween(start?: string, end?: string): number {
  if (!start || !end) return Number.NaN
  return (Date.parse(end) - Date.parse(start)) / 1000
}

/** Selects the last attempt of the first recipient. Multi-recipient fan-out is out of scope. */
function primaryAttempt(res: CalleResponse): CalleAttempt | undefined {
  const attempts = res.recipients?.[0]?.attempts ?? []
  return attempts[attempts.length - 1]
}

export function normalizeCalleCall(res: CalleResponse): CallRecord {
  const attempt = primaryAttempt(res)

  const transcript: TranscriptSpan[] = (attempt?.transcript_turns ?? []).map((t) => ({
    offsetSeconds: t.offset_seconds ?? 0,
    speaker: mapSpeaker(t.speaker),
    text: t.text ?? '',
  }))

  return {
    id: res.id,
    provider: 'calle',
    placedAt: res.created_at ?? '',
    durationSeconds: secondsBetween(attempt?.started_at, attempt?.completed_at),
    task: res.task ?? '',
    transcript,
    structuredResult: res.structured_result ?? null,
    selfReport: {
      taskCompleted: res.task_completed ?? null,
      confidence: res.completion_confidence?.score ?? null,
      summary: res.summary ?? null,
    },
  }
}
