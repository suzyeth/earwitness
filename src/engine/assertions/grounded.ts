import type { Assertion, AssertionContext, TranscriptSpan, Verdict } from '../../types.js'

const NAME = 'grounded'
const DEFAULT_MIN_OVERLAP = 0.6

/** Same contract as `terminated_cleanly`: absent is fine, wrong-typed is a loud failure. */
function readField(params: Record<string, unknown>): string {
  const raw = params.field
  if (typeof raw !== 'string' || raw === '') {
    throw new Error(`${NAME}: params.field is required and must be a non-empty string.`)
  }
  return raw
}

function readMinOverlap(params: Record<string, unknown>): number {
  const raw = params.minOverlap
  if (raw === undefined) return DEFAULT_MIN_OVERLAP
  if (typeof raw !== 'number') {
    throw new Error(`${NAME}: params.minOverlap must be a number, received ${typeof raw}.`)
  }
  return raw
}

function tokenize(text: string): string[] {
  return text.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 0)
}

/** Fraction of the value's tokens that appear in the span. */
function overlap(value: string, span: string): number {
  const valueTokens = tokenize(value)
  if (valueTokens.length === 0) return 0
  const spanTokens = new Set(tokenize(span))
  const hits = valueTokens.filter((t) => spanTokens.has(t)).length
  return hits / valueTokens.length
}

/** Three of this assertion's four exits are failures, so a local helper earns its keep here. */
function fail(rationale: string, evidence: TranscriptSpan[] = []): Verdict {
  return { assertion: NAME, result: 'fail', evidence, rationale }
}

export const grounded: Assertion = {
  name: NAME,
  tier: 1,

  async evaluate(ctx: AssertionContext): Promise<Verdict> {
    const field = readField(ctx.params)
    const minOverlap = readMinOverlap(ctx.params)

    const result = ctx.record.structuredResult
    if (!result || !(field in result)) {
      return fail(`Field "${field}" is absent from the structured result.`)
    }

    const value = String(result[field] ?? '')
    if (value.trim() === '') {
      return fail(`Field "${field}" is present but empty; nothing was actually captured.`)
    }

    const calleeSpans = ctx.record.transcript.filter((s) => s.speaker === 'callee')
    const match = calleeSpans.find((s) => overlap(value, s.text) >= minOverlap)

    if (!match) {
      return fail(
        `Field "${field}" = "${value}" cannot be located in anything the callee said. ` +
          `The agent may have supplied it without hearing it.`,
      )
    }

    return {
      assertion: NAME,
      result: 'pass',
      evidence: [match],
      rationale: `Field "${field}" = "${value}" is grounded in a callee turn at ${match.offsetSeconds}s.`,
    }
  },
}
