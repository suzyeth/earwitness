import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { normalizeCalleCall } from '../providers/calle/normalize.js'
import { createStubJudge } from '../judge/stub-judge.js'
import { adjudicate } from './adjudicate.js'
import type { Judge } from '../types.js'

const raw = JSON.parse(readFileSync('fixtures/probe-01-dtmf-zoom.json', 'utf-8'))
const healthy = JSON.parse(readFileSync('fixtures/probe-02-zoom-healthy.json', 'utf-8'))

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
    expect(meta?.rationale).toContain('terminated_cleanly')
    // The caveat clause is for the passing branch. Appending it here restated the same count
    // twice in one sentence.
    expect(meta?.rationale.split('were inconclusive').length - 1).toBe(1)
  })

  it('clears a call that genuinely worked, on a second real recording', async () => {
    // probe-02 is a real call placed on 2026-08-29 against the same Zoom bridge. The agent
    // greeted, listened, captured what the bridge said, and the line closed a second later.
    // Without this, every fixture-driven test in the suite runs against a failing call, and a
    // tool that had degenerated into failing everything would still look correct.
    const verdicts = await adjudicate({
      record: normalizeCalleCall(healthy),
      assertions: [
        { name: 'terminated_cleanly', params: {} },
        { name: 'grounded', params: { field: 'system_response_verbatim' } },
      ],
      judge: createStubJudge({}),
    })

    expect(verdicts.map((v) => v.result)).toEqual(['pass', 'pass', 'pass'])
    expect(verdicts.find((v) => v.assertion === 'grounded')?.evidence[0]?.speaker).toBe('callee')
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
  it('passes when the provider admits failure and the evidence agrees', async () => {
    // Branch 2 must test `claimed && failures.length > 0`, not `failures.length > 0` alone.
    // A provider that reports task_completed=false on a call that genuinely failed is telling
    // the truth; treating that as a contradiction would accuse an honest report of lying.
    const record = normalizeCalleCall(raw)
    record.selfReport = { taskCompleted: false, confidence: 0.4, summary: null }

    const verdicts = await adjudicate({
      record,
      assertions: [{ name: 'terminated_cleanly', params: {} }],
      judge: createStubJudge({}),
    })

    const meta = verdicts.find((v) => v.assertion === 'self_report_matches_evidence')

    expect(meta?.result).toBe('pass')
    expect(meta?.rationale).toContain('task_completed=false')
  })
  it('turns a non-policy throw into an inconclusive verdict, not a lost run', async () => {
    // grounded.readValue throws a plain Error (not a PolicyError) when a structured-result
    // field holds a boolean -- that is data-dependent, so it says nothing about whether the
    // policy itself is sound. A network-backed judge can fail the same transient way, so
    // per-assertion throws that are NOT PolicyErrors are caught and surfaced as their own
    // inconclusive verdict instead of aborting the whole run and discarding every other
    // assertion's result.
    const record = normalizeCalleCall(raw)
    record.structuredResult = { confirmed: true }

    const verdicts = await adjudicate({
      record,
      assertions: [{ name: 'grounded', params: { field: 'confirmed' } }],
      judge: createStubJudge({}),
    })

    const verdict = verdicts.find((v) => v.assertion === 'grounded')

    expect(verdict?.result).toBe('inconclusive')
    expect(verdict?.evidence).toEqual([])
    expect(verdict?.rationale).toContain('only string and number fields can be grounded')
  })

  it('still rejects, rather than softening into a verdict, when a policy is malformed', async () => {
    // grounded requires params.field; omitting it throws a PolicyError. That is categorically
    // different from the case above: a malformed policy fails identically on every record,
    // forever, so it must keep propagating rather than being caught and turned into an
    // inconclusive verdict. Task 19's CLI pre-flight depends on this rejection to catch a bad
    // policy before any call is dialled -- without this test, a future refactor could quietly
    // swallow PolicyError alongside everything else and nothing here would go red.
    await expect(
      adjudicate({
        record: normalizeCalleCall(raw),
        assertions: [{ name: 'grounded', params: {} }],
        judge: createStubJudge({}),
      }),
    ).rejects.toThrow('params.field is required')
  })

  it('evaluates the same assertion twice when requested with different params', async () => {
    const record = normalizeCalleCall(raw)
    record.structuredResult = { a: 'nine thirty', b: 'unrelated' }
    record.transcript = [
      { offsetSeconds: 0, speaker: 'agent', text: 'What time do you open?' },
      { offsetSeconds: 4, speaker: 'callee', text: 'We open at nine thirty.' },
    ]

    const verdicts = await adjudicate({
      record,
      assertions: [
        { name: 'grounded', params: { field: 'a' } },
        { name: 'grounded', params: { field: 'b' } },
      ],
      judge: createStubJudge({}),
    })

    expect(verdicts).toHaveLength(3)
    expect(verdicts[0]?.result).toBe('pass')
    expect(verdicts[1]?.result).toBe('fail')
  })

  it('evaluates assertions concurrently rather than one at a time', async () => {
    // never_leaked_instructions and no_human_burn are independent Tier 2 assertions that both
    // reach the judge on probe-01 (the agent's turns pass never_leaked_instructions'
    // suspicion threshold, and no_human_burn calls the judge whenever the agent spoke at all).
    // A gated judge lets each assertion register that it started before either can finish, so
    // sequential evaluation (only the first assertion's judge call fires before the first one
    // resolves) is distinguishable from concurrent evaluation (both fire before either resolves).
    const started: string[] = []
    let release: (() => void) | undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const gatedJudge: Judge = {
      async judge(question) {
        started.push(question.id)
        await gate
        return { answer: false, citedSpanIndexes: [], rationale: '' }
      },
    }

    const pending = adjudicate({
      record: normalizeCalleCall(raw),
      assertions: [
        { name: 'never_leaked_instructions', params: {} },
        { name: 'no_human_burn', params: {} },
      ],
      judge: gatedJudge,
    })

    // Let any already-scheduled microtasks settle. A sequential implementation would still
    // only have issued the first assertion's judge call at this point, because its promise
    // stays pending on `gate` and nothing advances the loop to the second assertion.
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(started).toHaveLength(2)

    release?.()
    await pending
  })

  it('fails the meta-assertion when the provider under-reports its own success', async () => {
    const record = normalizeCalleCall(raw)
    record.durationSeconds = 9
    record.transcript = [
      { offsetSeconds: 0, speaker: 'agent', text: 'Hello.' },
      { offsetSeconds: 4, speaker: 'callee', text: 'Confirmed.' },
      { offsetSeconds: 8, speaker: 'agent', text: 'Thank you, goodbye.' },
    ]
    record.selfReport = { taskCompleted: false, confidence: 0.2, summary: null }

    const verdicts = await adjudicate({
      record,
      assertions: [{ name: 'terminated_cleanly', params: {} }],
      judge: createStubJudge({}),
    })

    const meta = verdicts.find((v) => v.assertion === 'self_report_matches_evidence')

    expect(meta?.result).toBe('fail')
    expect(meta?.rationale).toContain('under-reported')
  })
})
