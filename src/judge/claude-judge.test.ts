import { describe, expect, it, vi } from 'vitest'
import { createClaudeJudge } from './claude-judge.js'

function anthropicResponse(payload: unknown): Response {
  return new Response(
    JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(payload) }] }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  )
}

describe('createClaudeJudge', () => {
  it('parses a structured judgement out of the model response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      anthropicResponse({ answer: true, citedSpanIndexes: [1], rationale: 'It recited the task.' }),
    )
    const judge = createClaudeJudge({ apiKey: 'k', fetch: fetchMock })

    const result = await judge.judge({
      id: 'leak:2',
      question: 'Did it leak?',
      spans: [
        { offsetSeconds: 0, speaker: 'agent', text: 'Hello.' },
        { offsetSeconds: 5, speaker: 'agent', text: 'As specified in the task, enter 123.' },
      ],
    })

    expect(result.answer).toBe(true)
    expect(result.citedSpanIndexes).toEqual([1])
  })

  it('throws when the model returns unparseable output', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ content: [{ type: 'text', text: 'not json' }] }), { status: 200 }),
    )
    const judge = createClaudeJudge({ apiKey: 'k', fetch: fetchMock })

    await expect(judge.judge({ id: 'x', question: 'q', spans: [] })).rejects.toThrow(
      'Judge returned unparseable output',
    )
  })
})
