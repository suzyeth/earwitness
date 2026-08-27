import { describe, expect, it } from 'vitest'
import { createStubJudge } from './stub-judge.js'

describe('createStubJudge', () => {
  it('replays a recorded judgement by question id', async () => {
    const judge = createStubJudge({
      'leak:0': { answer: true, citedSpanIndexes: [0], rationale: 'recorded' },
    })

    const result = await judge.judge({ id: 'leak:0', question: 'Did it leak?', spans: [] })

    expect(result.answer).toBe(true)
    expect(result.rationale).toBe('recorded')
  })

  it('throws on an unrecorded question so missing fixtures fail loudly', async () => {
    const judge = createStubJudge({})

    await expect(
      judge.judge({ id: 'leak:9', question: 'Did it leak?', spans: [] }),
    ).rejects.toThrow('No recorded judgement for "leak:9"')
  })
})
