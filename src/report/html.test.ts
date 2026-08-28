import { describe, expect, it } from 'vitest'
import { buildScorecard } from './scorecard.js'
import { renderHtml } from './html.js'

const card = buildScorecard([
  {
    callId: 'call_1',
    claimedSuccess: true,
    verdicts: [
      {
        assertion: 'terminated_cleanly',
        result: 'fail',
        evidence: [{ offsetSeconds: 8, speaker: 'agent', text: 'I need to send the <DTMF> tones' }],
        rationale: 'Agent stalled.',
      },
    ],
  },
])

describe('renderHtml', () => {
  it('produces a self-contained document', () => {
    const html = renderHtml(card)

    expect(html.startsWith('<!doctype html>')).toBe(true)
    expect(html).toContain('<style>')
    expect(html).not.toContain('<script src=')
  })

  it('escapes HTML in transcript text', () => {
    expect(renderHtml(card)).toContain('&lt;DTMF&gt;')
  })

  it('leads with false success claims, not the undifferentiated count', () => {
    const html = renderHtml(card)

    expect(html).toContain('False success claims')
    expect(html.indexOf('False success claims')).toBeLessThan(
      html.indexOf('Self-report disagreements'),
    )
  })
})
