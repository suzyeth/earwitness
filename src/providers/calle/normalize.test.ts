import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { normalizeCalleCall } from './normalize.js'

const raw = JSON.parse(readFileSync('fixtures/probe-01-dtmf-zoom.json', 'utf-8'))

describe('normalizeCalleCall', () => {
  it('maps the real probe-01 response into a CallRecord', () => {
    const record = normalizeCalleCall(raw)

    expect(record.id).toBe('call_YeJC_98WIgQvG6IbCmhrQA')
    expect(record.provider).toBe('calle')
    expect(record.selfReport.taskCompleted).toBe(true)
    expect(record.selfReport.confidence).toBeCloseTo(0.87)
    expect(record.transcript).toHaveLength(4)
  })

  it('maps CALL-E speaker "bot" to agent and "user" to callee', () => {
    const record = normalizeCalleCall(raw)

    expect(record.transcript[0]?.speaker).toBe('agent')
    expect(record.transcript[1]?.speaker).toBe('callee')
    expect(record.transcript[1]?.text).toContain('Welcome to Zoom')
  })

  it('derives duration from the attempt timestamps', () => {
    const record = normalizeCalleCall(raw)

    expect(record.durationSeconds).toBeGreaterThan(18)
    expect(record.durationSeconds).toBeLessThan(19)
  })

  it('reports an unknown duration as NaN rather than zero', () => {
    const record = normalizeCalleCall({
      id: 'call_no_timestamps',
      recipients: [{ attempts: [{ transcript_turns: [] }] }],
    })

    expect(Number.isNaN(record.durationSeconds)).toBe(true)
  })
})
