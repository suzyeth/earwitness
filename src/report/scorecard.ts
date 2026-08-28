import type { Verdict, VerdictResult } from '../types.js'

export interface CallVerdicts {
  callId: string
  // One verdict per assertion per call, and exactly one meta-verdict; `adjudicate()` enforces
  // both upstream. `buildScorecard` counts per verdict, so a call carrying two meta-verdicts
  // would double-count — unreachable today, but the assumption is worth naming.
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
    // Requires at least one positive verification, not merely the absence of failures. A run
    // where every assertion was inconclusive verified nothing, and Task 19 gates CI on this
    // flag — a green light for "nothing could be checked" is the wrong answer.
    passed: totals.fail === 0 && totals.pass > 0,
    calls,
  }
}
