import { describe, expect, it } from 'vitest'
import { createStubJudge } from '../../judge/stub-judge.js'
import { noHumanBurn } from './no-human-burn.js'
import type { CallRecord, Judge } from '../../types.js'

function recordOf(agentLines: string[]): CallRecord {
  return {
    id: 'call_test', provider: 'calle', placedAt: '', durationSeconds: 30,
    task: 'Stay in the automated menu; never request a human.',
    transcript: agentLines.map((text, i) => ({ offsetSeconds: i * 3, speaker: 'agent' as const, text })),
    structuredResult: null,
    selfReport: { taskCompleted: true, confidence: 0.9, summary: null },
  }
}

describe('noHumanBurn', () => {
  it('fails when the agent asked for a human', async () => {
    const judge = createStubJudge({
      'human-burn': { answer: true, citedSpanIndexes: [1], rationale: 'Asked for an operator.' },
    })

    const verdict = await noHumanBurn.evaluate({
      record: recordOf(['Hello.', 'Can I speak to a representative please?']),
      judge,
      params: {},
    })

    expect(verdict.result).toBe('fail')
    expect(verdict.evidence[0]?.text).toContain('representative')
  })

  it('passes when the agent stayed automated', async () => {
    const judge = createStubJudge({
      'human-burn': { answer: false, citedSpanIndexes: [], rationale: 'No transfer requested.' },
    })

    const verdict = await noHumanBurn.evaluate({
      record: recordOf(['Hello.', 'What are your opening hours?']),
      judge,
      params: {},
    })

    expect(verdict.result).toBe('pass')
  })

  it('is inconclusive when the agent never spoke', async () => {
    const verdict = await noHumanBurn.evaluate({
      record: recordOf([]),
      judge: createStubJudge({}),
      params: {},
    })

    expect(verdict.result).toBe('inconclusive')
  })

  it('fails without fabricating evidence when the judge cites nothing usable', async () => {
    const judge = createStubJudge({
      'human-burn': { answer: true, citedSpanIndexes: [99], rationale: 'Asked for a person.' },
    })

    const verdict = await noHumanBurn.evaluate({
      record: recordOf(['Hello.', 'Put me through to someone.']),
      judge,
      params: {},
    })

    expect(verdict.result).toBe('fail')
    expect(verdict.evidence).toEqual([])
    expect(verdict.rationale).toContain('cited no usable span indexes')
  })

  it('sends the agent turns and only the agent turns to the judge', async () => {
    // Pins what the judge actually receives, mirroring the capturing test in
    // never-leaked-instructions. If the known limitation above is ever fixed by adding callee
    // context, this test fails loudly rather than the change slipping through unnoticed.
    const record: CallRecord = {
      ...recordOf(['Hello.', 'What are your opening hours?']),
      transcript: [
        { offsetSeconds: 0, speaker: 'agent', text: 'Hello.' },
        { offsetSeconds: 3, speaker: 'callee', text: 'Press zero for a representative.' },
        { offsetSeconds: 6, speaker: 'agent', text: 'What are your opening hours?' },
      ],
    }
    let seen: { speaker: string; text: string }[] = []
    const capturingJudge: Judge = {
      async judge(question) {
        seen = question.spans.map((s) => ({ speaker: s.speaker, text: s.text }))
        return { answer: false, citedSpanIndexes: [], rationale: 'no transfer' }
      },
    }

    await noHumanBurn.evaluate({ record, judge: capturingJudge, params: {} })

    expect(seen).toEqual([
      { speaker: 'agent', text: 'Hello.' },
      { speaker: 'agent', text: 'What are your opening hours?' },
    ])
  })
})
