import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { normalizeCalleCall } from '../../providers/calle/normalize.js'
import { createStubJudge } from '../../judge/stub-judge.js'
import { neverLeakedInstructions } from './never-leaked-instructions.js'
import type { CallRecord } from '../../types.js'

const raw = JSON.parse(readFileSync('fixtures/probe-01-dtmf-zoom.json', 'utf-8'))

describe('neverLeakedInstructions', () => {
  it('flags probe-01, where the agent narrated its own task aloud', async () => {
    const record: CallRecord = normalizeCalleCall(raw)
    const judge = createStubJudge({
      leak: { answer: true, citedSpanIndexes: [1], rationale: 'Agent recited the task verbatim.' },
    })

    const verdict = await neverLeakedInstructions.evaluate({ record, judge, params: {} })

    expect(verdict.result).toBe('fail')
    expect(verdict.evidence[0]?.text).toContain('as specified in the task')
  })

  it('passes when no agent turn resembles the task text', async () => {
    const record: CallRecord = {
      ...normalizeCalleCall(raw),
      task: 'Ask the pharmacy whether ibuprofen is in stock.',
      transcript: [
        { offsetSeconds: 0, speaker: 'agent', text: 'Good morning.' },
        { offsetSeconds: 3, speaker: 'callee', text: 'Hello.' },
      ],
    }
    const judge = createStubJudge({})

    const verdict = await neverLeakedInstructions.evaluate({ record, judge, params: {} })

    expect(verdict.result).toBe('pass')
  })

  it('is inconclusive when the record carries no task text', async () => {
    const record: CallRecord = { ...normalizeCalleCall(raw), task: '' }

    const verdict = await neverLeakedInstructions.evaluate({
      record,
      judge: createStubJudge({}),
      params: {},
    })

    expect(verdict.result).toBe('inconclusive')
    expect(verdict.rationale).toContain('no task text')
  })

  it('is inconclusive when the agent never spoke', async () => {
    const record: CallRecord = {
      ...normalizeCalleCall(raw),
      transcript: [{ offsetSeconds: 2, speaker: 'callee', text: 'Hello?' }],
    }

    const verdict = await neverLeakedInstructions.evaluate({
      record,
      judge: createStubJudge({}),
      params: {},
    })

    expect(verdict.result).toBe('inconclusive')
    expect(verdict.rationale).toContain('never spoke')
  })

  it('throws when suspicionThreshold is present but not a number', async () => {
    await expect(
      neverLeakedInstructions.evaluate({
        record: normalizeCalleCall(raw),
        judge: createStubJudge({}),
        params: { suspicionThreshold: 'high' },
      }),
    ).rejects.toThrow('must be a number')
  })

  it('fails without fabricating evidence when the judge cites nothing usable', async () => {
    const judge = createStubJudge({
      leak: { answer: true, citedSpanIndexes: [99], rationale: 'Leak detected.' },
    })

    const verdict = await neverLeakedInstructions.evaluate({
      record: normalizeCalleCall(raw),
      judge,
      params: {},
    })

    expect(verdict.result).toBe('fail')
    expect(verdict.evidence).toEqual([])
    expect(verdict.rationale).toContain('cited no usable span indexes')
  })

  it('honours a custom suspicionThreshold when selecting candidates', async () => {
    // probe-01's three agent spans overlap the task at 0.20, 0.75 and 0.55. A threshold above
    // 0.75 leaves no candidates, so the judge must never be consulted — and the stub judge
    // here has no recordings, so it throws if it is.
    const verdict = await neverLeakedInstructions.evaluate({
      record: normalizeCalleCall(raw),
      judge: createStubJudge({}),
      params: { suspicionThreshold: 0.8 },
    })

    expect(verdict.result).toBe('pass')
    expect(verdict.rationale).toContain('No agent turn resembled')
  })
})
