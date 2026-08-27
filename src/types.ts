/** Who spoke. `callee` is the far end of the call; `agent` is the phone agent under test. */
export type Speaker = 'agent' | 'callee'

export interface TranscriptSpan {
  offsetSeconds: number
  speaker: Speaker
  text: string
}

/** What the provider claims about its own call. Data to be adjudicated, never a shortcut. */
export interface SelfReport {
  taskCompleted: boolean | null
  confidence: number | null
  summary: string | null
}

export interface CallRecord {
  id: string
  provider: string
  placedAt: string
  durationSeconds: number
  /** The natural-language task the agent was given. Needed to detect instruction leakage. */
  task: string
  transcript: TranscriptSpan[]
  structuredResult: Record<string, unknown> | null
  selfReport: SelfReport
}

export type VerdictResult = 'pass' | 'fail' | 'inconclusive'

export interface Verdict {
  assertion: string
  result: VerdictResult
  evidence: TranscriptSpan[]
  rationale: string
}

/** A semantic question posed to a Tier 2 judge about a specific set of spans. */
export interface JudgeQuestion {
  id: string
  question: string
  spans: TranscriptSpan[]
}

export interface Judgement {
  answer: boolean
  /**
   * Indexes into the `spans` array of the `JudgeQuestion` being answered — not into the
   * full transcript. Callers pass a filtered subset of spans, so these are local indexes.
   */
  citedSpanIndexes: number[]
  rationale: string
}

export interface Judge {
  judge(question: JudgeQuestion): Promise<Judgement>
}

export interface AssertionContext {
  record: CallRecord
  judge: Judge
  params: Record<string, unknown>
}

export interface Assertion {
  name: string
  tier: 1 | 2
  evaluate(ctx: AssertionContext): Promise<Verdict>
}
