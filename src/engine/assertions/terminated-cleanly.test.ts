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

  it('is inconclusive when the callee spoke last and the line then sat silent', async () => {
    const record = { ...normalizeCalleCall(raw), durationSeconds: 40 }
    record.transcript = [
      { offsetSeconds: 0, speaker: 'agent', text: 'Are you still there?' },
      { offsetSeconds: 5, speaker: 'callee', text: 'Hold on a moment.' },
    ]

    const verdict = await terminatedCleanly.evaluate(ctx(record))

    expect(verdict.result).toBe('inconclusive')
    expect(verdict.rationale).toContain('not proof of agent fault')
  })

  it('passes when the dead air exactly equals the limit', async () => {
    const record = { ...normalizeCalleCall(raw), durationSeconds: 13 }
    record.transcript = [{ offsetSeconds: 8, speaker: 'agent', text: 'Goodbye.' }]

    const verdict = await terminatedCleanly.evaluate(ctx(record))

    expect(verdict.result).toBe('pass')
  })

  it('honours a custom maxDanglingSeconds supplied by policy', async () => {
    const record = normalizeCalleCall(raw)

    expect((await terminatedCleanly.evaluate(ctx(record))).result).toBe('fail')
    expect(
      (await terminatedCleanly.evaluate(ctx(record, { maxDanglingSeconds: 30 }))).result,
    ).toBe('pass')
  })

  it('throws when maxDanglingSeconds is present but not a number', async () => {
    await expect(
      terminatedCleanly.evaluate(ctx(normalizeCalleCall(raw), { maxDanglingSeconds: '30' })),
    ).rejects.toThrow('must be a number')
  })
})
