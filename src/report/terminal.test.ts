import { describe, expect, it } from 'vitest'
import { buildScorecard } from './scorecard.js'
import { renderTerminal } from './terminal.js'

const card = buildScorecard([
  {
    callId: 'call_YeJC',
    claimedSuccess: true,
    verdicts: [
      { assertion: 'terminated_cleanly', result: 'fail', evidence: [], rationale: 'Agent stalled.' },
      {
        assertion: 'self_report_matches_evidence',
        result: 'fail',
        evidence: [],
        rationale: 'Provider reported task_completed=true at confidence 0.87.',
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
    expect(renderTerminal(card)).toContain('self-report disagreed with evidence on 1 of 1 call')
  })

  it('separates false success claims from disagreements in general', () => {
    expect(renderTerminal(card)).toContain('1 claimed SUCCESS on a call the evidence says failed')
  })
})
