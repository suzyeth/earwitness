import type { Assertion, AssertionContext, Verdict } from '../../types.js'

const NAME = 'terminated_cleanly'
const DEFAULT_MAX_DANGLING_SECONDS = 5

/**
 * Distinguishes "absent" from "present but wrong type". A policy that says
 * `maxDanglingSeconds: "10"` must fail loudly rather than silently reverting to the default
 * and quietly verifying something other than what the operator asked for. Zod validates the
 * policy file's shape but types `params` as `Record<string, unknown>`, so it cannot catch
 * this — the assertion is the only place that knows its own parameter contract.
 */
function readMaxDangling(params: Record<string, unknown>): number {
  const raw = params.maxDanglingSeconds
  if (raw === undefined) return DEFAULT_MAX_DANGLING_SECONDS
  if (typeof raw !== 'number') {
    throw new Error(`${NAME}: params.maxDanglingSeconds must be a number, received ${typeof raw}.`)
  }
  return raw
}

export const terminatedCleanly: Assertion = {
  name: NAME,
  tier: 1,

  async evaluate(ctx: AssertionContext): Promise<Verdict> {
    const { transcript, durationSeconds } = ctx.record
    const maxDangling = readMaxDangling(ctx.params)

    const last = transcript[transcript.length - 1]

    if (!last) {
      return {
        assertion: NAME,
        result: 'inconclusive',
        evidence: [],
        rationale: 'Transcript is empty; nothing to adjudicate.',
      }
    }

    // Measured for BOTH final speakers. Silence after a callee turn is still silence.
    const dangling = durationSeconds - last.offsetSeconds

    // `normalize` yields NaN for an unknown duration. Never let unknown read as fine.
    if (!Number.isFinite(dangling)) {
      return {
        assertion: NAME,
        result: 'inconclusive',
        evidence: [last],
        rationale:
          'Call duration is unknown, so dead air cannot be measured. Refusing to report a ' +
          'clean termination on missing data.',
      }
    }

    if (dangling > maxDangling) {
      // Who held the floor decides how damning the silence is.
      if (last.speaker === 'agent') {
        return {
          assertion: NAME,
          result: 'fail',
          evidence: [last],
          rationale:
            `Agent spoke last at ${last.offsetSeconds}s, then ${dangling.toFixed(1)}s of dead air ` +
            `elapsed before the call ended (limit ${maxDangling}s). The agent stalled rather than closing.`,
        }
      }

      return {
        assertion: NAME,
        result: 'inconclusive',
        evidence: [last],
        rationale:
          `Callee spoke last at ${last.offsetSeconds}s, then ${dangling.toFixed(1)}s of dead air ` +
          `elapsed before the call ended (limit ${maxDangling}s). The agent never closed the call, ` +
          `but silence following a callee turn is not proof of agent fault.`,
      }
    }

    return {
      assertion: NAME,
      result: 'pass',
      evidence: [last],
      rationale:
        `Call ended ${dangling.toFixed(1)}s after the final turn at ${last.offsetSeconds}s, ` +
        `within the ${maxDangling}s limit.`,
    }
  },
}
