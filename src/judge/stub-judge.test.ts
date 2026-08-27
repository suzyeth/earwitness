import { describe, expect, it } from 'vitest'
import { createStubJudge } from './stub-judge.js'

describe('createStubJudge', () => {
  it('replays a recorded judgement by question id', async () => {
    const judge = createStubJudge({
      'leak:0': { answer: true, citedSpanIndexes: [0], rationale: 'recorded' },
      'leak:1': { answer: false, citedSpanIndexes: [], rationale: 'second recording' },
    })

    const first = await judge.judge({ id: 'leak:0', question: 'Did it leak?', spans: [] })
    const second = await judge.judge({ id: 'leak:1', question: 'Did it leak?', spans: [] })

    expect(first.answer).toBe(true)
    expect(first.rationale).toBe('recorded')

    // Two entries, not one, on purpose: a lookup that ignored `question.id` and returned the
    // first recorded value would satisfy the assertions above. Keyed replay is the whole
    // point of this stub for `disclosed_ai_before_first_question`, whose loop asks
    // `disclose:0`, `question:0`, `disclose:1`, ... and stops early.
    expect(second.answer).toBe(false)
    expect(second.rationale).toBe('second recording')
  })

  it('throws on an unrecorded question so missing fixtures fail loudly', async () => {
    const judge = createStubJudge({})

    await expect(
      judge.judge({ id: 'leak:9', question: 'Did it leak?', spans: [] }),
    ).rejects.toThrow('No recorded judgement for "leak:9"')
  })
})
