import { describe, expect, it } from 'vitest'
import { getAssertion, listAssertions } from './registry.js'

describe('registry', () => {
  it('resolves every assertion by its declared name', () => {
    for (const name of listAssertions()) {
      expect(getAssertion(name)?.name).toBe(name)
    }
  })

  it('exposes exactly the five adjudicable assertions', () => {
    expect(listAssertions().sort()).toEqual([
      'disclosed_ai_before_first_question',
      'grounded',
      'never_leaked_instructions',
      'no_human_burn',
      'terminated_cleanly',
    ])
  })

  it('returns undefined for an unknown name', () => {
    expect(getAssertion('does_not_exist')).toBeUndefined()
  })

  it('does not register the self-report meta-assertion', () => {
    expect(getAssertion('self_report_matches_evidence')).toBeUndefined()
  })
})
