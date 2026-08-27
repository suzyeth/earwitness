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

/** CALL-E labels the far end "user" and its own agent "bot". */
function mapSpeaker(raw: string | undefined): Speaker {
  return raw === 'bot' ? 'agent' : 'callee'
}

function secondsBetween(start?: string, end?: string): number {
  if (!start || !end) return 0
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
