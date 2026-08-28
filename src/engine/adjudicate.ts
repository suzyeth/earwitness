import type { CallRecord, Judge, TranscriptSpan, Verdict } from '../types.js'
import { getAssertion } from './registry.js'
import { PolicyError } from './policy-error.js'

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

/**
 * Runs one requested assertion to a Verdict. Rejects only for a `PolicyError`; every other
 * throw is caught and turned into an `inconclusive` verdict.
 *
 * The two are categorically different. A `PolicyError` (a missing required param, a param of
 * the wrong type) will fail identically on every record, forever -- it is a defect in the
 * policy file, not the call, so it must keep propagating and reach the operator before
 * anything is dialled. The CLI's pre-flight in Task 19 depends on that propagation. Any other
 * throw (a network hiccup inside a Tier 2 judge call, for instance) might succeed on retry and
 * says nothing about the other four assertions, so before this it would abort the whole
 * `Promise.all` and discard every other assertion's result -- tolerable when the only Judge was
 * a deterministic in-memory stub, not once Tier 2 assertions are making real network calls to a
 * fallible model.
 */
async function evaluateOne(
  request: AssertionRequest,
  record: CallRecord,
  judge: Judge,
): Promise<Verdict> {
  const assertion = getAssertion(request.name)

  if (!assertion) {
    return {
      assertion: request.name,
      result: 'inconclusive',
      evidence: [],
      rationale: `Unknown assertion "${request.name}".`,
    }
  }

  try {
    return await assertion.evaluate({ record, judge, params: request.params })
  } catch (error) {
    // A malformed policy fails the same way on every call, so it must not be softened into a
    // verdict — the pre-flight in the CLI depends on it propagating before anything is dialled.
    if (error instanceof PolicyError) throw error

    const message = error instanceof Error ? error.message : String(error)
    return {
      assertion: request.name,
      result: 'inconclusive',
      evidence: [],
      rationale: `Assertion threw and was not evaluated: ${message}`,
    }
  }
}

export async function adjudicate(input: AdjudicateInput): Promise<Verdict[]> {
  // Assertions are independent, so they run concurrently rather than as a sequential chain of
  // (potentially network-backed) judge calls. Promise.all preserves the input order in its
  // resolved array regardless of completion order, so verdict order still matches request order.
  const verdicts = await Promise.all(
    input.assertions.map((request) => evaluateOne(request, input.record, input.judge)),
  )

  verdicts.push(selfReportMatchesEvidence(input.record, verdicts))
  return verdicts
}
