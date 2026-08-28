import type { CallRecord, Judge, TranscriptSpan, Verdict } from '../types.js'
import { getAssertion } from './registry.js'

export interface AssertionRequest {
  name: string
  params: Record<string, unknown>
}

export interface AdjudicateInput {
  record: CallRecord
  assertions: AssertionRequest[]
  judge: Judge
}

const META = 'self_report_matches_evidence'

/**
 * Compares the provider's own success claim against the verdicts derived from evidence.
 * Pure, Tier 1, no judge. A disagreement in either direction is a failure.
 */
function selfReportMatchesEvidence(record: CallRecord, verdicts: Verdict[]): Verdict {
  const claimed = record.selfReport.taskCompleted
  const failures = verdicts.filter((v) => v.result === 'fail')
  const unresolved = verdicts.filter((v) => v.result === 'inconclusive')
  const passes = verdicts.filter((v) => v.result === 'pass')
  const evidence: TranscriptSpan[] = failures.flatMap((v) => v.evidence)
  const confidence = record.selfReport.confidence

  /**
   * Only a confirmed contradiction challenges the self-report — the same evidentiary
   * conservatism assertions themselves obey. But an `inconclusive` is not always "no signal":
   * a stall detected after a callee turn, for example, carries evidence and names a real
   * pattern. A bare `pass` that absorbed it silently would invite over-trust, so the count is
   * always surfaced in the rationale.
   */
  const caveat =
    unresolved.length > 0
      ? ` ${unresolved.length} assertion(s) were inconclusive and were not used to challenge the report: ` +
        `${unresolved.map((v) => v.assertion).join(', ')}.`
      : ''

  if (claimed === null) {
    return {
      assertion: META,
      result: 'inconclusive',
      evidence: [],
      rationale: 'The provider reported no completion claim, so there is nothing to compare.',
    }
  }

  if (claimed && failures.length > 0) {
    const names = failures.map((f) => f.assertion).join(', ')
    return {
      assertion: META,
      result: 'fail',
      evidence,
      rationale:
        `Provider reported task_completed=true` +
        (confidence !== null ? ` at confidence ${confidence}` : '') +
        `, but evidence-based adjudication failed on: ${names}.`,
    }
  }

  // "Agrees with the evidence" is a lie when there is no evidence. A wholly silent call makes
  // every assertion inconclusive, and a success claim resting on that has been neither
  // corroborated nor contradicted. Saying so is more honest than passing it.
  if (failures.length === 0 && passes.length === 0) {
    return {
      assertion: META,
      result: 'inconclusive',
      evidence: [],
      rationale:
        `Provider reported task_completed=${claimed}, but nothing could be verified: ` +
        `${unresolved.length} assertion(s) were inconclusive and none passed` +
        (unresolved.length > 0 ? ` (${unresolved.map((v) => v.assertion).join(', ')}).` : '.'),
    }
  }

  if (!claimed && failures.length === 0) {
    return {
      assertion: META,
      result: 'fail',
      evidence: [],
      rationale:
        'Provider reported task_completed=false, but every evidence-based assertion passed. ' +
        'The provider under-reported its own success.',
    }
  }

  return {
    assertion: META,
    result: 'pass',
    evidence: [],
    rationale: `Provider self-report (task_completed=${claimed}) agrees with the evidence.${caveat}`,
  }
}

export async function adjudicate(input: AdjudicateInput): Promise<Verdict[]> {
  const verdicts: Verdict[] = []

  for (const request of input.assertions) {
    const assertion = getAssertion(request.name)

    if (!assertion) {
      verdicts.push({
        assertion: request.name,
        result: 'inconclusive',
        evidence: [],
        rationale: `Unknown assertion "${request.name}".`,
      })
      continue
    }

    verdicts.push(
      await assertion.evaluate({
        record: input.record,
        judge: input.judge,
        params: request.params,
      }),
    )
  }

  verdicts.push(selfReportMatchesEvidence(input.record, verdicts))
  return verdicts
}
