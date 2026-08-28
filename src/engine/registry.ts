import type { Assertion } from '../types.js'
import { disclosedAiFirst } from './assertions/disclosed-ai-first.js'
import { grounded } from './assertions/grounded.js'
import { neverLeakedInstructions } from './assertions/never-leaked-instructions.js'
import { noHumanBurn } from './assertions/no-human-burn.js'
import { terminatedCleanly } from './assertions/terminated-cleanly.js'

/**
 * `self_report_matches_evidence` is deliberately absent. It is a meta-assertion computed over
 * the verdict set in `adjudicate()`, not something a policy can request or configure, and
 * registering it would let a policy switch off the one check the provider cannot influence.
 */
const ASSERTIONS: Assertion[] = [
  terminatedCleanly,
  grounded,
  neverLeakedInstructions,
  disclosedAiFirst,
  noHumanBurn,
]

const BY_NAME = new Map(ASSERTIONS.map((a) => [a.name, a]))

export function getAssertion(name: string): Assertion | undefined {
  return BY_NAME.get(name)
}

export function listAssertions(): string[] {
  return [...BY_NAME.keys()]
}
