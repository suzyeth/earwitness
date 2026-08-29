/**
 * Writes two scorecards for the `diff` subcommand to compare, both derived from the real
 * recorded call. `before.json` is the call as it actually happened; `after.json` is the same
 * call with the hang-up pulled ten seconds earlier, standing in for an agent that was fixed.
 *
 * No network, no model, no phone call. The committed fixture is never modified — the timestamp
 * is patched on an in-memory copy.
 *
 *   npx tsx demo-make-scorecards.ts
 *   npm run cli -- diff before.json after.json
 *
 * Untracked scratch file, not part of the build.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { adjudicate } from './src/engine/adjudicate.js'
import { normalizeCalleCall, type CalleResponse } from './src/providers/calle/normalize.js'
import { buildScorecard } from './src/report/scorecard.js'
import type { Judge } from './src/types.js'

const noJudge: Judge = {
  judge: async () => {
    throw new Error('Tier 1 adjudication must not consult a model')
  },
}

async function scorecardFor(raw: CalleResponse) {
  const record = normalizeCalleCall(raw)
  const verdicts = await adjudicate({
    record,
    assertions: [{ name: 'terminated_cleanly', params: {} }],
    judge: noJudge,
  })
  return buildScorecard([
    { callId: record.id, claimedSuccess: record.selfReport.taskCompleted, verdicts },
  ])
}

const original = readFileSync('fixtures/probe-01-dtmf-zoom.json', 'utf-8')

// The agent still stalls: 10.3s of dead air after its last turn.
const before = await scorecardFor(JSON.parse(original) as CalleResponse)

// The same call with the hang-up ten seconds earlier, as if the stall had been fixed.
const patched = original.replace('19:59:36.017501Z', '19:59:26.017501Z')
if (patched === original) throw new Error('timestamp patch did not apply')
const after = await scorecardFor(JSON.parse(patched) as CalleResponse)

writeFileSync('before.json', JSON.stringify(before, null, 2), 'utf-8')
writeFileSync('after.json', JSON.stringify(after, null, 2), 'utf-8')

console.log(`before.json  passed=${before.passed}  fail=${before.totals.fail}`)
console.log(`after.json   passed=${after.passed}  fail=${after.totals.fail}`)
console.log()
console.log('Now compare them with the real CLI:')
console.log('  npm run cli -- diff before.json after.json')
