import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { normalizeCalleCall } from '../providers/calle/normalize.js'
import { createStubJudge } from '../judge/stub-judge.js'
import { adjudicate } from './adjudicate.js'

const raw = JSON.parse(readFileSync('fixtures/probe-01-dtmf-zoom.json', 'utf-8'))

describe('adjudicate', () => {
  it('catches probe-01: the provider claimed success on a call that failed', async () => {
    const verdicts = await adjudicate({
      record: normalizeCalleCall(raw),
      assertions: [{ name: 'terminated_cleanly', params: {} }],
      judge: createStubJudge({}),
    })

    const meta = verdicts.find((v) => v.assertion === 'self_report_matches_evidence')

    expect(meta?.result).toBe('fail')
    expect(meta?.rationale).toContain('task_completed=true')
    expect(meta?.evidence.length).toBeGreaterThan(0)
  })

  it('passes the meta-assertion when self-report and evidence agree', async () => {
    const record = normalizeCalleCall(raw)
    record.durationSeconds = 9
    record.transcript = [
      { offsetSeconds: 0, speaker: 'agent', text: 'Hello.' },
      { offsetSeconds: 4, speaker: 'callee', text: 'Confirmed.' },
      { offsetSeconds: 8, speaker: 'agent', text: 'Thank you, goodbye.' },
    ]

    const verdicts = await adjudicate({
      record,
      assertions: [{ name: 'terminated_cleanly', params: {} }],
      judge: createStubJudge({}),
    })

    expect(verdicts.find((v) => v.assertion === 'self_report_matches_evidence')?.result).toBe('pass')
  })

  it('names inconclusive assertions in the passing rationale so they are not lost', async () => {
    // One assertion passes and one is inconclusive, so the claim is genuinely corroborated in
    // part. terminated_cleanly passes (agent closes, call ends promptly); grounded is
    // inconclusive because there are no callee turns to check the field against.
    const record = normalizeCalleCall(raw)
    record.durationSeconds = 3
    record.transcript = [{ offsetSeconds: 0, speaker: 'agent', text: 'Hello.' }]
    record.structuredResult = { opens: 'nine thirty' }

    const verdicts = await adjudicate({
      record,
      assertions: [
        { name: 'terminated_cleanly', params: {} },
        { name: 'grounded', params: { field: 'opens' } },
      ],
      judge: createStubJudge({}),
    })

    const meta = verdicts.find((v) => v.assertion === 'self_report_matches_evidence')

    expect(meta?.result).toBe('pass')
    expect(meta?.rationale).toContain('1 assertion(s) were inconclusive')
    expect(meta?.rationale).toContain('grounded')
  })

  it('will not call a success claim corroborated when nothing could be verified', async () => {
    // A wholly silent call: every assertion goes inconclusive, so there is no evidence either
    // way. Passing here would let "the call never really happened" sail through.
    const record = { ...normalizeCalleCall(raw), transcript: [], durationSeconds: Number.NaN }

    const verdicts = await adjudicate({
      record,
      assertions: [{ name: 'terminated_cleanly', params: {} }],
      judge: createStubJudge({}),
    })

    const meta = verdicts.find((v) => v.assertion === 'self_report_matches_evidence')

    expect(meta?.result).toBe('inconclusive')
    expect(meta?.rationale).toContain('nothing could be verified')
  })

  it('reports an unknown assertion as inconclusive rather than throwing', async () => {
    const verdicts = await adjudicate({
      record: normalizeCalleCall(raw),
      assertions: [{ name: 'no_such_assertion', params: {} }],
      judge: createStubJudge({}),
    })

    expect(verdicts[0]?.result).toBe('inconclusive')
    expect(verdicts[0]?.rationale).toContain('Unknown assertion')
  })
})
