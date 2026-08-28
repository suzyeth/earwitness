import type { VerdictResult } from '../types.js'
import type { Scorecard } from './scorecard.js'

export interface DiffEntry {
  callId: string
  assertion: string
}

export interface RegressionDiff {
  fixed: DiffEntry[]
  regressed: DiffEntry[]
  unchanged: number
}

function index(card: Scorecard): Map<string, VerdictResult> {
  const map = new Map<string, VerdictResult>()
  for (const call of card.calls) {
    for (const verdict of call.verdicts) {
      map.set(`${call.callId}::${verdict.assertion}`, verdict.result)
    }
  }
  return map
}

export function diffScorecards(before: Scorecard, after: Scorecard): RegressionDiff {
  const a = index(before)
  const b = index(after)

  const fixed: DiffEntry[] = []
  const regressed: DiffEntry[] = []
  let unchanged = 0

  for (const [key, afterResult] of b) {
    const beforeResult = a.get(key)
    if (beforeResult === undefined) continue

    const [callId = '', assertion = ''] = key.split('::')

    if (beforeResult === 'fail' && afterResult !== 'fail') {
      fixed.push({ callId, assertion })
    } else if (beforeResult !== 'fail' && afterResult === 'fail') {
      regressed.push({ callId, assertion })
    } else {
      unchanged += 1
    }
  }

  return { fixed, regressed, unchanged }
}
