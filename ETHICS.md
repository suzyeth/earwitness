# Callee policy

The system under test is the **outbound agent**, not the person answering.

Every demo, test, and example call in this repository is directed at a **public automated
answering service** — conference dial-in bridges and automated information lines. No stranger
is called and no human agent's time is consumed.

This is a design constraint, not a disclaimer:

- Runs are reproducible, because the callee is a deterministic machine.
- No controlled phone number is required to operate the tool.
- Assertions about agent behaviour are measurable without involving an unconsenting third party.

Sample policies use real, publicly published automated numbers. Any phone number appearing in
documentation examples is either such a number or is masked.
