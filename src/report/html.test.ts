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
        evidence: [
          {
            offsetSeconds: 8,
            speaker: 'agent',
            // Every character escapeHtml handles, in one span. Without the ampersand and the
            // quote, dropping either replacement from escapeHtml goes unnoticed.
            text: 'Press <DTMF> "1" & wait',
          },
        ],
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
    const html = renderHtml(card)

    expect(html).toContain('&lt;DTMF&gt;')
    expect(html).toContain('&amp;')
    expect(html).toContain('&quot;')
    // The raw forms must not survive anywhere in the evidence block.
    expect(html).not.toContain('<DTMF>')
    expect(html).not.toContain('" & wait')
  })

  it('leads with false success claims, not the undifferentiated count', () => {
    const html = renderHtml(card)

    expect(html).toContain('False success claims')
    expect(html.indexOf('False success claims')).toBeLessThan(
      html.indexOf('Self-report disagreements'),
    )
  })
})
