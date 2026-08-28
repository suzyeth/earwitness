import { describe, expect, it } from 'vitest'
import { parseCliArgs } from './index.js'

describe('parseCliArgs', () => {
  it('parses the audit subcommand', () => {
    expect(parseCliArgs(['audit', 'call_123', '--policy', 'p.yaml'])).toEqual({
      command: 'audit',
      callId: 'call_123',
      policyPath: 'p.yaml',
      htmlOut: undefined,
    })
  })

  it('parses the run subcommand with an html output path', () => {
    expect(parseCliArgs(['run', 'p.yaml', '--html', 'out.html'])).toEqual({
      command: 'run',
      policyPath: 'p.yaml',
      htmlOut: 'out.html',
    })
  })

  it('parses the diff subcommand', () => {
    expect(parseCliArgs(['diff', 'a.json', 'b.json'])).toEqual({
      command: 'diff',
      beforePath: 'a.json',
      afterPath: 'b.json',
    })
  })

  it('throws on an unknown command', () => {
    expect(() => parseCliArgs(['fly'])).toThrow('Unknown command "fly"')
  })
})
