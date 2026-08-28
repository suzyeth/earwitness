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

// A second pair covering every transition the diff can see, including the ones the simple
// fixture above cannot reach.
const rich = {
  before: buildScorecard([
    {
      callId: 'c1',
      claimedSuccess: true,
      verdicts: [
        v('was_fail_now_pass', 'fail'),
        v('was_pass_now_fail', 'pass'),
        v('was_fail_now_inconclusive', 'fail'),
        v('was_pass_now_inconclusive', 'pass'),
        v('was_inconclusive_still', 'inconclusive'),
      ],
    },
  ]),
  after: buildScorecard([
    {
      callId: 'c1',
      claimedSuccess: true,
      verdicts: [
        v('was_fail_now_pass', 'pass'),
        v('was_pass_now_fail', 'fail'),
        v('was_fail_now_inconclusive', 'inconclusive'),
        v('was_pass_now_inconclusive', 'inconclusive'),
        v('was_inconclusive_still', 'inconclusive'),
        v('brand_new_assertion', 'fail'),
      ],
    },
  ]),
}

describe('diffScorecards across every transition', () => {
  it('treats a move off fail as fixed, whether it lands on pass or inconclusive', () => {
    const d = diffScorecards(rich.before, rich.after)

    expect(d.fixed.map((e) => e.assertion).sort()).toEqual([
      'was_fail_now_inconclusive',
      'was_fail_now_pass',
    ])
  })

  it('reports only a move onto fail as a regression', () => {
    const d = diffScorecards(rich.before, rich.after)

    expect(d.regressed).toEqual([{ callId: 'c1', assertion: 'was_pass_now_fail' }])
  })

  it('skips an assertion that did not exist in the earlier run', () => {
    const d = diffScorecards(rich.before, rich.after)
    const seen = [...d.fixed, ...d.regressed].map((e) => e.assertion)

    // A newly added assertion has no prior state, so it cannot have regressed from anything.
    expect(seen).not.toContain('brand_new_assertion')
    expect(d.fixed.length + d.regressed.length + d.unchanged).toBe(5)
  })

  it('counts pass to inconclusive as unchanged, which is a deliberate blind spot', () => {
    const d = diffScorecards(rich.before, rich.after)

    // Neither end is a fail, so this diff does not call it a regression even though something
    // that used to be verified no longer is. That drift surfaces instead in the scorecard's
    // own `passed` flag, which requires at least one positive verification.
    expect(d.unchanged).toBe(2)
    expect(d.regressed.map((e) => e.assertion)).not.toContain('was_pass_now_inconclusive')
  })
})
