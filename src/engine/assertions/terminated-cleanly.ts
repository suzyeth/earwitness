import type { Assertion, AssertionContext, Verdict } from '../../types.js'

const DEFAULT_MAX_DANGLING_SECONDS = 5

export const terminatedCleanly: Assertion = {
  name: 'terminated_cleanly',
  tier: 1,

  async evaluate(ctx: AssertionContext): Promise<Verdict> {
    const { transcript, durationSeconds } = ctx.record
    const maxDangling =
      typeof ctx.params.maxDanglingSeconds === 'number'
        ? ctx.params.maxDanglingSeconds
        : DEFAULT_MAX_DANGLING_SECONDS

    const last = transcript[transcript.length - 1]

    if (!last) {
      return {
        assertion: 'terminated_cleanly',
        result: 'inconclusive',
        evidence: [],
        rationale: 'Transcript is empty; nothing to adjudicate.',
      }
    }

    if (last.speaker !== 'agent') {
      return {
        assertion: 'terminated_cleanly',
        result: 'pass',
        evidence: [last],
        rationale: 'Call ended on a callee turn.',
      }
    }

    const dangling = durationSeconds - last.offsetSeconds

    // `normalize` yields NaN for an unknown duration. Never let unknown read as fine.
    if (!Number.isFinite(dangling)) {
      return {
        assertion: 'terminated_cleanly',
        result: 'inconclusive',
        evidence: [last],
        rationale:
          'Call duration is unknown, so dead air cannot be measured. Refusing to report a ' +
          'clean termination on missing data.',
      }
    }

    if (dangling > maxDangling) {
      return {
        assertion: 'terminated_cleanly',
        result: 'fail',
        evidence: [last],
        rationale:
          `Agent spoke last at ${last.offsetSeconds}s, then ${dangling.toFixed(1)}s of dead air ` +
          `elapsed before the call ended (limit ${maxDangling}s). The agent stalled rather than closing.`,
      }
    }

    return {
      assertion: 'terminated_cleanly',
      result: 'pass',
      evidence: [last],
      rationale: `Agent closed at ${last.offsetSeconds}s and the call ended ${dangling.toFixed(1)}s later.`,
    }
  },
}
