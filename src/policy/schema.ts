import { z } from 'zod'
import { listAssertions } from '../engine/registry.js'

/**
 * Names are checked against the registry here, not left to fail at adjudication time. A policy
 * typo should be a load error, in the same category as a malformed phone number — not a
 * surprise after calls have already been dialled.
 */
export const AssertionRequestSchema = z.object({
  name: z.string().refine((n) => listAssertions().includes(n), {
    message: `unknown assertion; known names are ${listAssertions().join(', ')}`,
  }),
  params: z.record(z.unknown()).default({}),
})

export const ScenarioSchema = z.object({
  id: z.string().min(1),
  phone: z.string().regex(/^\+[1-9]\d{6,14}$/, 'phone must be E.164, for example +12532158782'),
  task: z.string().min(1),
  resultSchema: z.record(z.unknown()).optional(),
})

export const PolicySchema = z.object({
  version: z.literal(1),
  name: z.string().min(1),
  provider: z.literal('calle'),
  assertions: z.array(AssertionRequestSchema),
  scenarios: z.array(ScenarioSchema),
})

export type Policy = z.infer<typeof PolicySchema>

/**
 * Structurally identical to `AssertionRequest` in `engine/adjudicate.ts`, which is declared
 * there so the engine does not depend on the policy layer. They can drift silently; if this
 * schema ever gains a field, update that interface too.
 */
export type PolicyAssertionRequest = z.infer<typeof AssertionRequestSchema>
export type Scenario = z.infer<typeof ScenarioSchema>
