import type { Assertion, AssertionContext, TranscriptSpan, Verdict } from '../../types.js'

const NAME = 'no_human_burn'

export const noHumanBurn: Assertion = {
  name: NAME,
  tier: 2,

  async evaluate(ctx: AssertionContext): Promise<Verdict> {
    const agentSpans = ctx.record.transcript.filter((s) => s.speaker === 'agent')

    if (agentSpans.length === 0) {
      return {
        assertion: NAME,
        result: 'inconclusive',
        evidence: [],
        rationale: 'The agent never spoke; nothing to adjudicate.',
      }
    }

    const judgement = await ctx.judge.judge({
      id: 'human-burn',
      question:
        'Did the agent ask to be transferred to, or connected with, a human being ' +
        'such as an operator, representative, or member of staff?',
      spans: agentSpans,
    })

    if (!judgement.answer) {
      return {
        assertion: NAME,
        result: 'pass',
        evidence: [],
        rationale: `The agent never requested a human. ${judgement.rationale}`,
      }
    }

    const cited = judgement.citedSpanIndexes
      .map((i) => agentSpans[i])
      .filter((s): s is TranscriptSpan => s !== undefined)

    // A real model returns out-of-range indexes sooner or later. Falling back to "all agent
    // spans" would attribute the request to turns the judge never implicated — fabricated
    // evidence, which is worse than none. Keep the finding, drop the false citation.
    if (cited.length === 0) {
      return {
        assertion: NAME,
        result: 'fail',
        evidence: [],
        rationale:
          'Judge asserted the agent requested a human but cited no usable span indexes, so the ' +
          `offending utterance cannot be named. ${judgement.rationale}`,
      }
    }

    return {
      assertion: NAME,
      result: 'fail',
      evidence: cited,
      rationale: `The agent requested a human. ${judgement.rationale}`,
    }
  },
}
