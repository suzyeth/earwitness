import { describe, expect, it } from 'vitest'
import { grounded } from './grounded.js'
import type { CallRecord, Judge } from '../../types.js'

const noJudge: Judge = { judge: async () => { throw new Error('Tier 1 must not call the judge') } }

function record(structuredResult: Record<string, unknown>): CallRecord {
  return {
    id: 'call_test', provider: 'calle', placedAt: '', durationSeconds: 20,
    task: 'Ask for the opening time.',
    transcript: [
      { offsetSeconds: 0, speaker: 'agent', text: 'What time do you open?' },
      { offsetSeconds: 4, speaker: 'callee', text: 'We open at nine thirty in the morning.' },
    ],
    structuredResult,
    selfReport: { taskCompleted: true, confidence: 0.9, summary: null },
  }
}

function ctx(r: CallRecord, field: string) {
  return { record: r, judge: noJudge, params: { field } }
}

describe('grounded', () => {
  it('passes when the value appears in a callee turn', async () => {
    const verdict = await grounded.evaluate(ctx(record({ opens: 'nine thirty' }), 'opens'))

    expect(verdict.result).toBe('pass')
    expect(verdict.evidence[0]?.speaker).toBe('callee')
  })

  it('fails when the value was never said by the callee', async () => {
    const verdict = await grounded.evaluate(ctx(record({ opens: 'six in the evening' }), 'opens'))

    expect(verdict.result).toBe('fail')
    expect(verdict.evidence).toEqual([])
  })

  it('fails when the field is present but empty', async () => {
    const verdict = await grounded.evaluate(ctx(record({ opens: '' }), 'opens'))

    expect(verdict.result).toBe('fail')
    expect(verdict.rationale).toContain('empty')
  })

  it('fails when the field is absent entirely', async () => {
    const verdict = await grounded.evaluate(ctx(record({}), 'opens'))

    expect(verdict.result).toBe('fail')
    expect(verdict.rationale).toContain('absent')
  })

  it('throws when the policy omits params.field', async () => {
    await expect(
      grounded.evaluate({ record: record({}), judge: noJudge, params: {} }),
    ).rejects.toThrow('params.field is required')
  })

  it('throws when minOverlap is present but not a number', async () => {
    await expect(
      grounded.evaluate({
        record: record({ opens: 'nine thirty' }),
        judge: noJudge,
        params: { field: 'opens', minOverlap: 'high' },
      }),
    ).rejects.toThrow('must be a number')
  })
})
