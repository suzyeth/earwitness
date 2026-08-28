import { describe, expect, it } from 'vitest'
import { loadPolicy, parsePolicy } from './load.js'

describe('parsePolicy', () => {
  it('parses the example policy from disk', () => {
    const policy = loadPolicy('policy.example.yaml')

    expect(policy.name).toBe('Automated-line baseline')
    expect(policy.assertions).toHaveLength(4)
    expect(policy.scenarios[0]?.phone).toBe('+12532158782')
    expect(policy.scenarios[0]?.resultSchema).toBeDefined()
  })

  it('defaults params to an empty object', () => {
    const policy = parsePolicy(`
version: 1
name: minimal
provider: calle
assertions:
  - name: terminated_cleanly
scenarios: []
`)

    expect(policy.assertions[0]?.params).toEqual({})
  })

  it('rejects a policy declaring an unsupported version', () => {
    // assertions is non-empty on purpose: with an empty list the .min(1) check would throw
    // independently and a bare .toThrow() could not tell which defect fired.
    expect(() =>
      parsePolicy(`
version: 99
name: from the future
provider: calle
assertions:
  - name: terminated_cleanly
scenarios: []
`),
    ).toThrow(/version/)
  })

  it('rejects a policy that requests no assertions at all', () => {
    expect(() =>
      parsePolicy(`
version: 1
name: nothing to check
provider: calle
assertions: []
scenarios: []
`),
    ).toThrow(/at least one assertion/)
  })

  it('rejects an assertion name the registry does not know', () => {
    expect(() =>
      parsePolicy(`
version: 1
name: typo
provider: calle
assertions:
  - name: terminated_clean
scenarios: []
`),
    ).toThrow(/unknown assertion/)
  })

  it('rejects a phone number that is not E.164', () => {
    expect(() =>
      parsePolicy(`
version: 1
name: bad
provider: calle
assertions: []
scenarios:
  - id: x
    phone: "0800 123 456"
    task: hello
`),
    ).toThrow(/E\.164/)
  })
})
