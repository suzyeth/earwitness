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

/**
 * Only strings and numbers can meaningfully be compared against speech. A boolean would
 * stringify to "true"/"false" — words a callee essentially never utters — so every boolean
 * field would fail permanently and indistinguishably from a real hallucination. Objects
 * stringify to "[object Object]". Coercing those silently would yield a confident but
 * meaningless verdict, so this fails loudly instead.
 */
function readValue(field: string, raw: unknown): string {
  if (typeof raw === 'string') return raw
  if (typeof raw === 'number') return String(raw)
  if (raw === null || raw === undefined) return ''
  throw new Error(
    `${NAME}: field "${field}" is ${typeof raw}; only string and number fields can be grounded.`,
  )
}

/**
 * Token-literal matching, with three known limits.
 *
 * 1. No number or format normalization. A value stored as "9:30am" will not match a
 *    transcript rendering "nine thirty in the morning", and a name spelled out letter by
 *    letter will not match the whole word. This errs toward false FAILS on reformatted
 *    values — the conservative direction for an anti-hallucination check, but a real source
 *    of false alarms on short high-value fields like times, phone numbers, and names.
 * 2. Negation-blind. "Not Tuesday, actually Thursday" contains every token of the value
 *    "Tuesday" and scores full overlap. That is the dangerous direction, and it is inherent
 *    to bag-of-words matching rather than cheaply fixable at Tier 1.
 * 3. ASCII-only character class, so accented and non-Latin text is dropped or truncated
 *    ("café" tokenizes to ["caf"]). Acceptable while supported calls are English.
 */
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

    const value = readValue(field, result[field])
    if (value.trim() === '') {
      return fail(`Field "${field}" is present but empty; nothing was actually captured.`)
    }

    const calleeSpans = ctx.record.transcript.filter((s) => s.speaker === 'callee')

    // Searched-and-not-found is a finding. Nothing-to-search is not. Mirrors the
    // empty-transcript branch in `terminated_cleanly`.
    if (calleeSpans.length === 0) {
      return {
        assertion: NAME,
        result: 'inconclusive',
        evidence: [],
        rationale:
          `Transcript contains no callee turns, so field "${field}" cannot be verified ` +
          `against anything the other party said.`,
      }
    }

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
