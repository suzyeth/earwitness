import { describe, expect, it } from 'vitest'
import { buildScorecard } from './scorecard.js'
import type { Verdict } from '../types.js'

const verdicts: Verdict[] = [
  { assertion: 'terminated_cleanly', result: 'fail', evidence: [], rationale: 'stalled' },
  { assertion: 'no_human_burn', result: 'pass', evidence: [], rationale: 'ok' },
  { assertion: 'grounded', result: 'inconclusive', evidence: [], rationale: 'no data' },
  { assertion: 'self_report_matches_evidence', result: 'fail', evidence: [], rationale: 'lied' },
]

describe('buildScorecard', () => {
  it('counts each verdict result', () => {
    const card = buildScorecard([{ callId: 'call_1', claimedSuccess: true, verdicts }])

    expect(card.totals).toEqual({ pass: 1, fail: 2, inconclusive: 1 })
  })

  it('reports the self-report disagreement rate separately', () => {
    const card = buildScorecard([{ callId: 'call_1', claimedSuccess: true, verdicts }])

    expect(card.selfReportDisagreements).toBe(1)
    expect(card.callCount).toBe(1)
  })

  it('marks the run as failed when any assertion failed', () => {
    const card = buildScorecard([{ callId: 'call_1', claimedSuccess: true, verdicts }])

    expect(card.passed).toBe(false)
  })

  it('separates a false success claim from mere under-reporting', () => {
    const meta = (result: Verdict['result']): Verdict => ({
      assertion: 'self_report_matches_evidence', result, evidence: [], rationale: '',
    })

    const card = buildScorecard([
      { callId: 'overclaim', claimedSuccess: true, verdicts: [meta('fail')] },
      { callId: 'underclaim', claimedSuccess: false, verdicts: [meta('fail')] },
    ])

    // Both are disagreements, but only one is the failure this tool exists to surface.
    expect(card.selfReportDisagreements).toBe(2)
    expect(card.falseSuccessClaims).toBe(1)
  })

  it('does not let an inconclusive fail a run that verified something', () => {
    // A verdict that could not be evaluated is not a failure. Paired with a passing verdict on
    // purpose: without one, this case is indistinguishable from "nothing was verified", which
    // is a different question answered by the next test.
    const card = buildScorecard([
      {
        callId: 'call_1',
        claimedSuccess: null,
        verdicts: [
          { assertion: 'terminated_cleanly', result: 'pass', evidence: [], rationale: '' },
          { assertion: 'grounded', result: 'inconclusive', evidence: [], rationale: '' },
        ],
      },
    ])

    expect(card.totals.inconclusive).toBe(1)
    expect(card.passed).toBe(true)
  })

  it('does not pass a run in which nothing could be verified at all', () => {
    // Also the only test that sums totals across more than one call.
    const card = buildScorecard([
      {
        callId: 'a',
        claimedSuccess: true,
        verdicts: [
          { assertion: 'terminated_cleanly', result: 'inconclusive', evidence: [], rationale: '' },
        ],
      },
      {
        callId: 'b',
        claimedSuccess: true,
        verdicts: [
          { assertion: 'grounded', result: 'inconclusive', evidence: [], rationale: '' },
        ],
      },
    ])

    expect(card.totals).toEqual({ pass: 0, fail: 0, inconclusive: 2 })
    expect(card.passed).toBe(false)
  })

  it('marks the run as passed when nothing failed', () => {
    const card = buildScorecard([
      { callId: 'call_1', claimedSuccess: true, verdicts: [{ assertion: 'x', result: 'pass', evidence: [], rationale: '' }] },
    ])

    expect(card.passed).toBe(true)
  })
})
