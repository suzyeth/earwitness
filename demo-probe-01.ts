/**
 * Runs the real recorded probe-01 CALL-E response through the whole pipeline and prints the
 * report a human would read. Costs nothing: no network, no phone call, no model.
 *
 *   npx tsx demo-probe-01.ts
 *
 * Untracked scratch file, not part of the build.
 */
import { readFileSync } from 'node:fs'
import { adjudicate } from './src/engine/adjudicate.js'
import { normalizeCalleCall, type CalleResponse } from './src/providers/calle/normalize.js'
import { buildScorecard } from './src/report/scorecard.js'
import { renderTerminal } from './src/report/terminal.js'
import type { Judge } from './src/types.js'

const raw = JSON.parse(
  readFileSync('fixtures/probe-01-dtmf-zoom.json', 'utf-8'),
) as CalleResponse

const record = normalizeCalleCall(raw)

console.log('What CALL-E reported about this call')
console.log('='.repeat(60))
console.log(`  task_completed : ${record.selfReport.taskCompleted}`)
console.log(`  confidence     : ${record.selfReport.confidence}`)
console.log(`  duration       : ${record.durationSeconds.toFixed(1)}s`)
console.log()

console.log('What was actually said')
console.log('='.repeat(60))
for (const span of record.transcript) {
  console.log(`  ${String(span.offsetSeconds).padStart(2)}s  ${span.speaker.padEnd(6)}  ${span.text}`)
}
console.log(`      -- line went silent, then hung up --`)
console.log()

// Tier 1 only, so the judge must never be reached. It throws if it is.
const noJudge: Judge = {
  judge: async () => {
    throw new Error('Tier 1 adjudication must not consult a model')
  },
}

const verdicts = await adjudicate({
  record,
  assertions: [{ name: 'terminated_cleanly', params: {} }],
  judge: noJudge,
})

const card = buildScorecard([
  { callId: record.id, claimedSuccess: record.selfReport.taskCompleted, verdicts },
])

console.log(renderTerminal(card))
