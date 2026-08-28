import type { Verdict, VerdictResult } from '../types.js'

export interface CallVerdicts {
  callId: string
  /**
   * What the provider claimed about this call, carried alongside the verdicts so the scorecard
   * can split disagreements by direction without parsing rationale text.
   */
  claimedSuccess: boolean | null
  verdicts: Verdict[]
}

export interface Scorecard {
  callCount: number
  totals: Record<VerdictResult, number>
  /** Calls where the provider's own success claim contradicted the evidence, either way. */
  selfReportDisagreements: number
  /**
   * Of those, the ones that matter: the provider claimed success on a call the evidence says
   * failed. Under-reporting is also a disagreement and also counted above, but folding the two
   * together would dilute the single number this tool exists to produce.
   */
  falseSuccessClaims: number
  passed: boolean
  calls: CallVerdicts[]
}

const META = 'self_report_matches_evidence'

export function buildScorecard(calls: CallVerdicts[]): Scorecard {
  const totals: Record<VerdictResult, number> = { pass: 0, fail: 0, inconclusive: 0 }
  let selfReportDisagreements = 0
  let falseSuccessClaims = 0

  for (const call of calls) {
    for (const verdict of call.verdicts) {
      totals[verdict.result] += 1
      if (verdict.assertion === META && verdict.result === 'fail') {
        selfReportDisagreements += 1
        if (call.claimedSuccess === true) falseSuccessClaims += 1
      }
    }
  }

  return {
    callCount: calls.length,
    totals,
    selfReportDisagreements,
    falseSuccessClaims,
    passed: totals.fail === 0,
    calls,
  }
}
