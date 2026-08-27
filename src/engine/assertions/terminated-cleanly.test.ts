import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { normalizeCalleCall } from '../../providers/calle/normalize.js'
import { terminatedCleanly } from './terminated-cleanly.js'
import type { CallRecord, Judge } from '../../types.js'

const noJudge: Judge = { judge: async () => { throw new Error('Tier 1 must not call the judge') } }
const raw = JSON.parse(readFileSync('fixtures/probe-01-dtmf-zoom.json', 'utf-8'))

function ctx(record: CallRecord, params: Record<string, unknown> = {}) {
  return { record, judge: noJudge, params }
}

describe('terminatedCleanly', () => {
  it('fails on probe-01, where the agent stalled into 10s of dead air', async () => {
    const verdict = await terminatedCleanly.evaluate(ctx(normalizeCalleCall(raw)))

    expect(verdict.result).toBe('fail')
    expect(verdict.evidence).toHaveLength(1)
    expect(verdict.evidence[0]?.text).toContain('DTMF')
  })

  it('passes when the agent closes and the call ends promptly', async () => {
    const record = { ...normalizeCalleCall(raw), durationSeconds: 10 }
    record.transcript = [
      { offsetSeconds: 0, speaker: 'agent', text: 'Hello.' },
      { offsetSeconds: 4, speaker: 'callee', text: 'Yes, confirmed.' },
      { offsetSeconds: 8, speaker: 'agent', text: 'Thank you, goodbye.' },
    ]

    const verdict = await terminatedCleanly.evaluate(ctx(record))

    expect(verdict.result).toBe('pass')
  })

  it('is inconclusive when the transcript is empty', async () => {
    const record = { ...normalizeCalleCall(raw), transcript: [] }

    const verdict = await terminatedCleanly.evaluate(ctx(record))

    expect(verdict.result).toBe('inconclusive')
    expect(verdict.evidence).toEqual([])
  })

  it('is inconclusive when the call duration is unknown', async () => {
    const record = { ...normalizeCalleCall(raw), durationSeconds: Number.NaN }

    const verdict = await terminatedCleanly.evaluate(ctx(record))

    expect(verdict.result).toBe('inconclusive')
    expect(verdict.rationale).toContain('duration is unknown')
  })
})
