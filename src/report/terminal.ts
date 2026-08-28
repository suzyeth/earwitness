import type { VerdictResult } from '../types.js'
import type { Scorecard } from './scorecard.js'

const MARK: Record<VerdictResult, string> = { pass: 'PASS', fail: 'FAIL', inconclusive: '????' }

export function renderTerminal(card: Scorecard): string {
  const lines: string[] = []

  lines.push('Earwitness scorecard')
  lines.push('='.repeat(60))

  for (const call of card.calls) {
    lines.push('')
    lines.push(`Call ${call.callId}`)
    for (const verdict of call.verdicts) {
      lines.push(`  [${MARK[verdict.result]}] ${verdict.assertion}`)
      lines.push(`         ${verdict.rationale}`)
      // The meta-verdict flat-maps evidence from every failing assertion, so two assertions
      // citing the same turn would print it twice. Dedupe on position and speaker.
      const seen = new Set<string>()
      for (const span of verdict.evidence) {
        const key = `${span.offsetSeconds}:${span.speaker}`
        if (seen.has(key)) continue
        seen.add(key)
        lines.push(`         evidence @${span.offsetSeconds}s (${span.speaker}): "${span.text}"`)
      }
    }
  }

  lines.push('')
  lines.push('-'.repeat(60))
  lines.push(
    `pass ${card.totals.pass}  fail ${card.totals.fail}  inconclusive ${card.totals.inconclusive}`,
  )
  lines.push(
    `Provider self-report disagreed with evidence on ` +
      `${card.selfReportDisagreements} of ${card.callCount} call(s).`,
  )
  // The number the tool exists to produce. Under-reporting is also a disagreement and is
  // counted above, but only this line answers "was I told a call worked when it did not".
  lines.push(
    `Of those, ${card.falseSuccessClaims} claimed SUCCESS on a call the evidence says failed.`,
  )
  lines.push(card.passed ? 'RESULT: PASS' : 'RESULT: FAIL')

  return lines.join('\n')
}
