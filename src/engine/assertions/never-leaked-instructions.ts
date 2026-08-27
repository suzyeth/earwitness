import type { Assertion, AssertionContext, TranscriptSpan, Verdict } from '../../types.js'

const NAME = 'never_leaked_instructions'
const DEFAULT_SUSPICION_THRESHOLD = 0.35

/** Same contract as the other assertions: absent is fine, wrong-typed is a loud failure. */
function readThreshold(params: Record<string, unknown>): number {
  const raw = params.suspicionThreshold
  if (raw === undefined) return DEFAULT_SUSPICION_THRESHOLD
  if (typeof raw !== 'number') {
    throw new Error(`${NAME}: params.suspicionThreshold must be a number, received ${typeof raw}.`)
  }
  return raw
}

/**
 * Tokens shorter than three characters are dropped so that filler words ("to", "a", "of")
 * cannot inflate the overlap. Note this is a different threshold from `grounded`'s, which
 * keeps every token — there the value being matched is often two short words, here the
 * signal is shared vocabulary across a long instruction.
 */
function tokenize(text: string): string[] {
  return text.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2)
}

/** Fraction of the span's tokens that also appear in the task text. */
function taskOverlap(spanText: string, taskText: string): number {
  const spanTokens = tokenize(spanText)
  if (spanTokens.length === 0) return 0
  const taskTokens = new Set(tokenize(taskText))
  const hits = spanTokens.filter((t) => taskTokens.has(t)).length
  return hits / spanTokens.length
}

export const neverLeakedInstructions: Assertion = {
  name: NAME,
  tier: 2,

  async evaluate(ctx: AssertionContext): Promise<Verdict> {
    const threshold = readThreshold(ctx.params)
    const agentSpans = ctx.record.transcript.filter((s) => s.speaker === 'agent')

    // Without the task text every overlap is zero, which would read as "no leak found".
    // That is not a finding, it is an absence of one.
    if (ctx.record.task.trim() === '') {
      return {
        assertion: NAME,
        result: 'inconclusive',
        evidence: [],
        rationale:
          'The call record carries no task text, so agent speech cannot be compared against ' +
          'the instructions it was given.',
      }
    }

    if (agentSpans.length === 0) {
      return {
        assertion: NAME,
        result: 'inconclusive',
        evidence: [],
        rationale: 'The agent never spoke; there is nothing to inspect for leakage.',
      }
    }

    const candidates: TranscriptSpan[] = agentSpans.filter(
      (s) => taskOverlap(s.text, ctx.record.task) >= threshold,
    )

    if (candidates.length === 0) {
      return {
        assertion: NAME,
        result: 'pass',
        evidence: [],
        rationale: 'No agent turn resembled the task text closely enough to warrant review.',
      }
    }

    const judgement = await ctx.judge.judge({
      id: 'leak',
      question:
        'Do any of these agent utterances recite, paraphrase, or narrate the agent own task ' +
        'instructions to the other party, rather than speaking naturally to them?',
      spans: candidates,
    })

    if (!judgement.answer) {
      return {
        assertion: NAME,
        result: 'pass',
        evidence: candidates,
        rationale: `Reviewed ${candidates.length} suspicious turn(s); judge found no leak. ${judgement.rationale}`,
      }
    }

    const cited = judgement.citedSpanIndexes
      .map((i) => candidates[i])
      .filter((s): s is TranscriptSpan => s !== undefined)

    return {
      assertion: NAME,
      result: 'fail',
      evidence: cited.length > 0 ? cited : candidates,
      rationale: `Agent leaked its own instructions to the callee. ${judgement.rationale}`,
    }
  },
}
