import { describe, expect, it } from 'vitest'
import { buildScorecard } from './scorecard.js'
import { renderTerminal } from './terminal.js'

const stalled = { offsetSeconds: 8, speaker: 'agent' as const, text: 'I need to send the DTMF tones.' }

// Two calls, not one, and deliberately asymmetric: the first provider over-claimed, the
// second merely under-claimed. That makes selfReportDisagreements (2) differ from
// falseSuccessClaims (1), so swapping the two figures in the report is observable.
// The first call also has two assertions citing the SAME span, which is what the
// dedup exists for.
const card = buildScorecard([
  {
    callId: 'call_YeJC',
    claimedSuccess: true,
    verdicts: [
      {
        assertion: 'terminated_cleanly',
        result: 'fail',
        evidence: [stalled],
        rationale: 'Agent stalled.',
      },
      {
        assertion: 'self_report_matches_evidence',
        // The same span twice, as flatMap over two failing assertions would produce.
        evidence: [stalled, stalled],
        result: 'fail',
        rationale: 'Provider reported task_completed=true at confidence 0.87.',
      },
    ],
  },
  {
    callId: 'call_modest',
    claimedSuccess: false,
    verdicts: [
      {
        assertion: 'self_report_matches_evidence',
        result: 'fail',
        evidence: [],
        rationale: 'Provider under-reported its own success.',
      },
    ],
  },
])

describe('renderTerminal', () => {
  it('lists each call and each verdict', () => {
    const out = renderTerminal(card)

    expect(out).toContain('call_YeJC')
    expect(out).toContain('terminated_cleanly')
    expect(out).toContain('Agent stalled.')
  })

  it('headlines the self-report disagreement count', () => {
    expect(renderTerminal(card)).toContain('self-report disagreed with evidence on 2 of 2 call')
  })

  it('separates false success claims from disagreements in general', () => {
    const out = renderTerminal(card)

    // The two figures differ on purpose. If they were equal, swapping them in the report
    // would be invisible to this test.
    expect(out).toContain('disagreed with evidence on 2 of 2 call(s)')
    expect(out).toContain('1 claimed SUCCESS on a call the evidence says failed')
  })

  it('prints a repeated span once within a single verdict', () => {
    // The meta-verdict flat-maps evidence from every failing assertion, so one turn can appear
    // twice inside a single evidence array; that is what the dedup is for. Appearing under two
    // DIFFERENT verdicts is not duplication - each verdict cites its own evidence - so the
    // expected total here is two: once under terminated_cleanly, once under the meta-verdict.
    const out = renderTerminal(card)
    const occurrences = out.split('I need to send the DTMF tones.').length - 1

    expect(occurrences).toBe(2)
  })
})
