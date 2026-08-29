# Earwitness

**An independent verification layer for phone-call agents.** It re-derives what happened on a
call from transcript evidence alone, and never trusts the provider's self-report.

## Why

The first call this project ever placed was reported by the API like this:

```json
{
  "task_completed": true,
  "completion_confidence": { "score": 0.87, "label": "high" },
  "summary": "The Zoom prompt was heard, but the call did not complete the keypad-entry test. There is no evidence that DTMF tones were sent or accepted, and no post-entry system response was captured before the call ended."
}
```

Those are the three fields of one real response, unedited. Note that `summary` already says
the test did not complete — the platform's own JSON disagrees with itself before Earwitness
ever gets involved.

Here is the entire call, exactly as `npx tsx demo-probe-01.ts` prints it:

```
 0s  agent   I'll begin by delivering the opening content.
 3s  callee  Welcome to Zoom. Enter your meeting ID followed by pound.
 5s  agent   The IVR is asking for the meeting ID followed by pound.
 8s  agent   I need to send the DTMF tones as specified in the task reference: 1234567890 followed by #.
      -- line went silent, then hung up --
```

No keypad tones were ever sent — CALL-E has no DTMF capability at all (see below), so the
agent narrated an intention it could not act on. The bridge never answered again. 18.3 seconds
after the call started, it ended on its own, 10.3 seconds after the agent's last turn.
`task_completed: true`, confidence `0.87`, label `"high"`.

The raw response is committed at `fixtures/probe-01-dtmf-zoom.json`, unmodified, from a real
call placed on 2026-08-26. Every claim above is reproducible from it — run the command yourself:

```bash
npx tsx demo-probe-01.ts
```

That script needs no network, no API key, and places no call. It replays the fixture through
the real engine and ends with the scorecard Earwitness actually produced:

```
Earwitness scorecard
============================================================

Call call_YeJC_98WIgQvG6IbCmhrQA
  [FAIL] terminated_cleanly
         Agent spoke last at 8s, then 10.3s of dead air elapsed before the call ended (limit 5s). The agent stalled rather than closing.
         evidence @8s (agent): "I need to send the DTMF tones as specified in the task reference: 1234567890 followed by #."
  [FAIL] self_report_matches_evidence
         Provider reported task_completed=true at confidence 0.87, but evidence-based adjudication failed on: terminated_cleanly.
         evidence @8s (agent): "I need to send the DTMF tones as specified in the task reference: 1234567890 followed by #."

------------------------------------------------------------
pass 0  fail 2  inconclusive 0
Provider self-report disagreed with evidence on 1 of 1 call(s).
Of those, 1 claimed SUCCESS on a call the evidence says failed.
RESULT: FAIL
```

If you operate a phone agent, `task_completed` is likely the only thing telling you your
success rate. On this call it was wrong.

## Install

```bash
npm install
export CALLE_API_KEY="..."
export ANTHROPIC_API_KEY="..."
```

## Use

Three subcommands:

```bash
# Adjudicate a call that already happened. Costs no new call.
npm run cli -- audit call_YeJC_98WIgQvG6IbCmhrQA --policy policy.example.yaml

# Place the calls declared in a policy, then adjudicate each one.
npm run cli -- run policy.example.yaml --html report.html

# Compare two scorecards; exits non-zero if anything regressed.
npm run cli -- diff before.json after.json
```

`audit` and `run` both need `CALLE_API_KEY`; `run` also places real calls, spending from
whatever call budget the account has. `diff` reads two local scorecard JSON files and needs
neither environment variable — it never constructs a provider client or a judge. That is
enforced in code, not just documented: in `src/cli/index.ts`, the `diff` branch returns before
either credential is read.

## Assertions

| Assertion | Tier | Catches |
|---|---|---|
| `terminated_cleanly` | 1 | Agent stalled into dead air instead of closing |
| `self_report_matches_evidence` | 1 | Provider's success claim contradicts the evidence |
| `grounded(field)` | 1 | A structured field the callee never actually said |
| `never_leaked_instructions` | 2 | Agent recited its own task prompt aloud |
| `disclosed_ai_before_first_question` | 2 | Disclosure landed after a substantive question |
| `no_human_burn` | 2 | Agent asked for a human when told not to |

**Tier 1** is computed by pure code with no model in the loop: turn ordering, timing, and
literal token overlap against transcript spans. **Tier 2** calls an injected `Judge` for
questions that need semantic judgment (paraphrase, disclosure, intent).

The headline assertion, `self_report_matches_evidence`, is Tier 1. It compares the provider's
`task_completed` boolean against the other Tier 1 verdicts for the same call — that is
arithmetic on booleans, not a model's opinion. The central claim of this project — that
`probe-01` was reported as a success despite doing nothing — does not depend on any LLM being
right about anything.

Every verdict cites transcript spans. A verdict that cannot cite spans returns `inconclusive`,
never `pass`.

### Reading the scorecard

The terminal and JSON scorecards report two related but distinct counts, and the names alone
don't make the distinction obvious:

- **`selfReportDisagreements`** — the number of calls where the provider's `task_completed`
  claim disagreed with the evidence-based verdict, **in either direction**. This includes a
  provider under-claiming: reporting failure on a call the evidence says actually succeeded.
- **`falseSuccessClaims`** — of those disagreements, only the ones where the provider claimed
  **success** on a call the evidence says failed. This is the direction that matters for an
  operator trusting the provider's own metrics, and it is always less than or equal to
  `selfReportDisagreements`.

Folding the two into one number would hide which direction the disagreement runs in, which is
the whole point of separating them.

## Who gets called

Automated answering services only, and the reasoning is a design constraint, not a courtesy.
See [ETHICS.md](ETHICS.md).

## Verified platform facts

Established by direct probe on 2026-08-26, not read from CALL-E's own documentation:

- Base URL `https://api.heycall-e.com` is real; the OpenAPI contract's own "Placeholder" label
  for it is stale. Auth is `Authorization: Bearer <key>`; issued keys are prefixed
  `iams_live_`, not the documented `calle_live_`.
- **No DTMF capability exists.** Zero hits for `dtmf|keypad|digit|tone|press` across the entire
  OpenAPI contract, corroborated by probe-01's live failure above. Keypad IVR trees cannot be
  navigated through this API today.
- `recipients` is an array, so fan-out to multiple numbers is native.
- `transcript_turns` is returned per attempt. That is the substrate Earwitness runs on.
- CALL-E labels the far end of the call `user` and its own agent `bot`; Earwitness normalizes
  these to the provider-neutral `callee` and `agent`.
- Local lines: US, SG, MY, IN, UAE, AU, MX, BR. Everything else runs on international lines
  that CALL-E itself labels "primarily intended for testing." Mainland China is unsupported.
- Observed anomaly, unconfirmed: `created_at` on probe-01 reads roughly six days behind the
  wall-clock time the call was actually placed.

## Status

This is a hackathon submission, not a deployed tool. It has no users and has processed no
production traffic — it has adjudicated exactly one real call, the probe above, plus whatever
calls a reader places themselves against `policy.example.yaml`.

Tier 1 assertions run against real evidence: the fixture, the engine, and the terminal output
in this README are all real. Tier 2 assertions have only ever been exercised against the
recorded stub judge in `src/judge/stub-judge.ts`, which is what every test in this repository
uses. A Claude-backed judge exists at `src/judge/claude-judge.ts` and is unit-tested against a
mocked `fetch` response, but no Tier 2 assertion has ever been adjudicated by a live model call.

`npm test` runs 100 tests across 18 files, all against fixtures and stubs — zero of them place
a phone call or make a network request. `npx tsc --noEmit` is clean under strict mode.
