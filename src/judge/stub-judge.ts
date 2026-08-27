import type { Judge, JudgeQuestion, Judgement } from '../types.js'

export type RecordedJudgements = Record<string, Judgement>

/**
 * A Judge that replays recorded answers. Unrecorded questions throw rather than
 * guessing, so a missing fixture surfaces as a test failure instead of a silent pass.
 */
export function createStubJudge(recorded: RecordedJudgements): Judge {
  return {
    async judge(question: JudgeQuestion): Promise<Judgement> {
      const hit = recorded[question.id]
      if (!hit) {
        throw new Error(`No recorded judgement for "${question.id}"`)
      }
      return hit
    },
  }
}
