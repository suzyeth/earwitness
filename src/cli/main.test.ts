import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { main, type MainDeps } from './index.js'
import type { CalleClient } from '../providers/calle/client.js'
import type { Judge } from '../types.js'

/**
 * These exercise `main` itself, not argument parsing. They exist because two guarantees had no
 * coverage at all and could have been deleted without anything going red: `diff` must work
 * without credentials, and `run` must abort on a malformed policy before a call is billed.
 */

const dir = mkdtempSync(join(tmpdir(), 'earwitness-cli-'))
afterEach(() => vi.restoreAllMocks())

function write(name: string, body: string): string {
  const path = join(dir, name)
  writeFileSync(path, body, 'utf-8')
  return path
}

function scorecard(result: 'pass' | 'fail') {
  return JSON.stringify({
    callCount: 1,
    totals: { pass: result === 'pass' ? 1 : 0, fail: result === 'fail' ? 1 : 0, inconclusive: 0 },
    selfReportDisagreements: 0,
    falseSuccessClaims: 0,
    passed: result === 'pass',
    calls: [
      {
        callId: 'c1',
        claimedSuccess: true,
        verdicts: [{ assertion: 'terminated_cleanly', result, evidence: [], rationale: '' }],
      },
    ],
  })
}

/** Throws if anything reaches it. A passing test proves the dialler was never touched. */
function refusingClient(): CalleClient {
  return {
    placeCall: vi.fn(async () => {
      throw new Error('dialled!')
    }),
    waitForCall: vi.fn(async () => {
      throw new Error('dialled!')
    }),
    getCall: vi.fn(async () => {
      throw new Error('dialled!')
    }),
  } as unknown as CalleClient
}

const silentJudge: Judge = {
  judge: async () => ({ answer: false, citedSpanIndexes: [], rationale: '' }),
}

describe('main', () => {
  it('runs diff with no credentials present at all', async () => {
    const saved = { calle: process.env.CALLE_API_KEY, anthropic: process.env.ANTHROPIC_API_KEY }
    delete process.env.CALLE_API_KEY
    delete process.env.ANTHROPIC_API_KEY
    vi.spyOn(console, 'log').mockImplementation(() => {})

    try {
      const clean = write('before-clean.json', scorecard('pass'))
      expect(await main(['diff', clean, write('after-clean.json', scorecard('pass'))])).toBe(0)

      const regressed = write('after-regressed.json', scorecard('fail'))
      expect(await main(['diff', clean, regressed])).toBe(1)
    } finally {
      if (saved.calle !== undefined) process.env.CALLE_API_KEY = saved.calle
      if (saved.anthropic !== undefined) process.env.ANTHROPIC_API_KEY = saved.anthropic
    }
  })

  it('aborts a malformed policy before anything is dialled', async () => {
    const client = refusingClient()
    const deps: MainDeps = { makeClient: () => client, makeJudge: () => silentJudge }

    const policy = write(
      'bad-policy.yaml',
      [
        'version: 1',
        'name: missing field',
        'provider: calle',
        'assertions:',
        '  - name: grounded',
        'scenarios:',
        '  - id: s1',
        '    phone: "+12532158782"',
        '    task: say hello',
        '',
      ].join('\n'),
    )

    await expect(main(['run', policy], deps)).rejects.toThrow('params.field is required')
    expect(client.placeCall).not.toHaveBeenCalled()
  })

  it('does reach the dialler when the policy is sound', async () => {
    // Without this, deleting the whole scenario loop would still satisfy the test above.
    const placed = { id: 'call_1', status: 'queued' }
    const finished = {
      id: 'call_1',
      task: 'say hello',
      created_at: '',
      task_completed: true,
      completion_confidence: { score: 0.9 },
      structured_result: null,
      recipients: [
        {
          attempts: [
            {
              started_at: '2026-08-26T00:00:00.000Z',
              completed_at: '2026-08-26T00:00:09.000Z',
              transcript_turns: [{ offset_seconds: 8, speaker: 'bot', text: 'Goodbye.' }],
            },
          ],
        },
      ],
    }
    const client = {
      placeCall: vi.fn(async () => placed),
      waitForCall: vi.fn(async () => finished),
      getCall: vi.fn(),
    } as unknown as CalleClient

    vi.spyOn(console, 'log').mockImplementation(() => {})
    const cwd = process.cwd()
    process.chdir(dir)
    try {
      const policy = write(
        'good-policy.yaml',
        [
          'version: 1',
          'name: sound',
          'provider: calle',
          'assertions:',
          '  - name: terminated_cleanly',
          'scenarios:',
          '  - id: s1',
          '    phone: "+12532158782"',
          '    task: say hello',
          '',
        ].join('\n'),
      )

      expect(await main(['run', policy], { makeClient: () => client, makeJudge: () => silentJudge })).toBe(0)
      expect(client.placeCall).toHaveBeenCalledTimes(1)
    } finally {
      process.chdir(cwd)
    }
  })
})

afterEach(() => {
  try {
    rmSync(join(dir, 'scorecard.json'), { force: true })
  } catch {
    // nothing written this run
  }
})
