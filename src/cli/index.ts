import { readFileSync, writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { pathToFileURL } from 'node:url'
import { adjudicate } from '../engine/adjudicate.js'
import { createClaudeJudge } from '../judge/claude-judge.js'
import { loadPolicy } from '../policy/load.js'
import { CalleClient } from '../providers/calle/client.js'
import { normalizeCalleCall, type CalleResponse } from '../providers/calle/normalize.js'
import { diffScorecards } from '../report/diff.js'
import { renderHtml } from '../report/html.js'
import { buildScorecard, type CallVerdicts } from '../report/scorecard.js'
import { renderTerminal } from '../report/terminal.js'
import type { Judge } from '../types.js'

/**
 * Injection points for the two things `main` would otherwise reach into the world for. Real
 * usage passes nothing and gets the defaults; tests pass doubles so the safety gates below —
 * `diff` needing no credentials, and pre-flight aborting before a call is billed — are
 * observable. Neither had any coverage before, and both could have been removed silently.
 */
export interface MainDeps {
  makeClient?: (apiKey: string) => CalleClient
  makeJudge?: (apiKey: string) => Judge
}

export type CliArgs =
  | { command: 'audit'; callId: string; policyPath: string; htmlOut: string | undefined }
  | { command: 'run'; policyPath: string; htmlOut: string | undefined }
  | { command: 'diff'; beforePath: string; afterPath: string }

export function parseCliArgs(argv: string[]): CliArgs {
  const [command, ...rest] = argv

  const { values, positionals } = parseArgs({
    args: rest,
    options: { policy: { type: 'string' }, html: { type: 'string' } },
    allowPositionals: true,
  })

  if (command === 'audit') {
    return {
      command: 'audit',
      callId: positionals[0] ?? '',
      policyPath: values.policy ?? 'policy.example.yaml',
      htmlOut: values.html,
    }
  }

  if (command === 'run') {
    return { command: 'run', policyPath: positionals[0] ?? '', htmlOut: values.html }
  }

  if (command === 'diff') {
    return { command: 'diff', beforePath: positionals[0] ?? '', afterPath: positionals[1] ?? '' }
  }

  throw new Error(`Unknown command "${command}". Expected audit, run, or diff.`)
}

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required environment variable ${name}`)
  return value
}

export async function main(argv: string[], deps: MainDeps = {}): Promise<number> {
  const args = parseCliArgs(argv)

  if (args.command === 'diff') {
    const before = JSON.parse(readFileSync(args.beforePath, 'utf-8'))
    const after = JSON.parse(readFileSync(args.afterPath, 'utf-8'))
    const result = diffScorecards(before, after)
    console.log(JSON.stringify(result, null, 2))
    return result.regressed.length === 0 ? 0 : 1
  }

  const policy = loadPolicy(args.policyPath)
  // Constructed here, below the `diff` early return, so comparing two local scorecards
  // never demands an account.
  const makeJudge = deps.makeJudge ?? ((k: string) => createClaudeJudge({ apiKey: k }))
  const makeClient = deps.makeClient ?? ((k: string) => new CalleClient({ apiKey: k }))
  const judge = makeJudge(requireEnv('ANTHROPIC_API_KEY'))
  const client = makeClient(requireEnv('CALLE_API_KEY'))
  const results: CallVerdicts[] = []

  if (args.command === 'audit') {
    const raw = await client.getCall(args.callId)
    const record = normalizeCalleCall(raw as unknown as CalleResponse)
    results.push({
      callId: record.id,
      claimedSuccess: record.selfReport.taskCompleted,
      verdicts: await adjudicate({ record, assertions: policy.assertions, judge }),
    })
  } else {
    // Pre-flight: force every assertion to validate its params against a synthetic record
    // before a single call is placed. `grounded` throws when `params.field` is missing, and
    // without this that throw would arrive after the phone had already rung — burning a call
    // from a budget of twenty to report a typo.
    await adjudicate({
      record: {
        id: 'preflight',
        provider: 'calle',
        placedAt: '',
        durationSeconds: Number.NaN,
        task: '',
        transcript: [],
        structuredResult: null,
        selfReport: { taskCompleted: null, confidence: null, summary: null },
      },
      assertions: policy.assertions,
      judge,
    })

    for (const scenario of policy.scenarios) {
      const placed = await client.placeCall({
        task: scenario.task,
        phone: scenario.phone,
        idempotencyKey: `earwitness-${policy.name}-${scenario.id}`,
        resultSchema: scenario.resultSchema,
      })
      const final = await client.waitForCall(placed.id)
      const record = normalizeCalleCall(final as unknown as CalleResponse)
      results.push({
        callId: record.id,
        claimedSuccess: record.selfReport.taskCompleted,
        verdicts: await adjudicate({ record, assertions: policy.assertions, judge }),
      })
    }
  }

  const card = buildScorecard(results)
  console.log(renderTerminal(card))

  if (args.htmlOut) {
    writeFileSync(args.htmlOut, renderHtml(card), 'utf-8')
    console.log(`\nHTML report written to ${args.htmlOut}`)
  }

  writeFileSync('scorecard.json', JSON.stringify(card, null, 2), 'utf-8')
  return card.passed ? 0 : 1
}

// `file://${process.argv[1]}` never matches on Windows: argv carries backslashes and a bare
// drive letter, while import.meta.url is a triple-slashed, forward-slashed URL. The guard
// silently failed and the bin entry did nothing at all. pathToFileURL normalises both.
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error))
      process.exit(2)
    })
}
