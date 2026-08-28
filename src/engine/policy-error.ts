/**
 * Thrown when a policy asks for something an assertion cannot do — a missing required param,
 * or one of the wrong type. Distinct from a transient failure on purpose: `adjudicate()`
 * degrades an ordinary throw into an `inconclusive` verdict so one flaky judge call cannot
 * blank a whole report, but a `PolicyError` will fail identically on every call forever, so
 * it must keep propagating and reach the operator before anything is dialled.
 */
export class PolicyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PolicyError'
  }
}
