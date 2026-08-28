import { describe, expect, it } from 'vitest'
import { buildScorecard } from './scorecard.js'
import { diffScorecards } from './diff.js'
import type { Verdict } from '../types.js'

function v(assertion: string, result: Verdict['result']): Verdict {
  return { assertion, result, evidence: [], rationale: '' }
}

const before = buildScorecard([
  { callId: 'c1', claimedSuccess: true, verdicts: [v('terminated_cleanly', 'fail'), v('no_human_burn', 'pass')] },
])
const after = buildScorecard([
  { callId: 'c1', claimedSuccess: true, verdicts: [v('terminated_cleanly', 'pass'), v('no_human_burn', 'fail')] },
])

describe('diffScorecards', () => {
  it('reports assertions that were fixed', () => {
    const d = diffScorecards(before, after)

    expect(d.fixed).toEqual([{ callId: 'c1', assertion: 'terminated_cleanly' }])
  })

  it('reports assertions that regressed', () => {
    const d = diffScorecards(before, after)

    expect(d.regressed).toEqual([{ callId: 'c1', assertion: 'no_human_burn' }])
  })

  it('reports nothing when the two scorecards are identical', () => {
    const d = diffScorecards(before, before)

    expect(d.fixed).toEqual([])
    expect(d.regressed).toEqual([])
    expect(d.unchanged).toBe(2)
  })
})
