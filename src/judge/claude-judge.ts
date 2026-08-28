import type { Judge, JudgeQuestion, Judgement } from '../types.js'

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-sonnet-5'

export interface ClaudeJudgeOptions {
  apiKey: string
  fetch?: typeof globalThis.fetch
  model?: string
}

const SYSTEM_PROMPT = `You adjudicate phone-call transcripts for a verification tool.
You are given a question and a numbered list of transcript spans.
Answer ONLY with a JSON object of the form:
{"answer": boolean, "citedSpanIndexes": number[], "rationale": string}
Cite the indexes of the spans that justify your answer. If no span justifies a true
answer, answer false. Never speculate beyond the spans provided.`

function renderSpans(question: JudgeQuestion): string {
  const spans = question.spans
    .map((s, i) => `[${i}] @${s.offsetSeconds}s (${s.speaker}): ${s.text}`)
    .join('\n')
  return `Question: ${question.question}\n\nSpans:\n${spans || '(none)'}`
}

export function createClaudeJudge(options: ClaudeJudgeOptions): Judge {
  const fetchImpl = options.fetch ?? globalThis.fetch
  const model = options.model ?? MODEL

  return {
    async judge(question: JudgeQuestion): Promise<Judgement> {
      const response = await fetchImpl(ANTHROPIC_URL, {
        method: 'POST',
        headers: {
          'x-api-key': options.apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model,
          max_tokens: 512,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: renderSpans(question) }],
        }),
      })

      if (!response.ok) {
        throw new Error(`Judge API responded ${response.status}`)
      }

      const payload = (await response.json()) as { content?: { type: string; text?: string }[] }
      const text = payload.content?.find((c) => c.type === 'text')?.text ?? ''

      try {
        const parsed = JSON.parse(text) as Judgement
        return {
          answer: Boolean(parsed.answer),
          citedSpanIndexes: parsed.citedSpanIndexes ?? [],
          rationale: parsed.rationale ?? '',
        }
      } catch {
        throw new Error(`Judge returned unparseable output: ${text.slice(0, 200)}`)
      }
    },
  }
}
