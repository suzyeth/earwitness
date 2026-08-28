import type { Scorecard } from './scorecard.js'

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const STYLE = `
  body { font: 15px/1.5 ui-sans-serif, system-ui, sans-serif; margin: 2rem auto; max-width: 52rem;
         color: #16181d; background: #fff; }
  h1 { font-size: 1.4rem; }
  .call { border: 1px solid #d8dce3; border-radius: 8px; padding: 1rem; margin: 1rem 0; }
  .verdict { margin: .75rem 0; padding-left: .75rem; border-left: 3px solid #d8dce3; }
  .fail { border-left-color: #c0362c; }
  .pass { border-left-color: #2e7d4f; }
  .inconclusive { border-left-color: #b8860b; }
  .tag { font-weight: 600; text-transform: uppercase; font-size: .75rem; letter-spacing: .04em; }
  .evidence { font-family: ui-monospace, monospace; font-size: .85rem; background: #f5f6f8;
              padding: .4rem .6rem; border-radius: 4px; margin: .3rem 0; overflow-x: auto; }
  .headline { font-size: 1.05rem; padding: .8rem 1rem; background: #fdf3f2; border-radius: 8px; }
`

export function renderHtml(card: Scorecard): string {
  const calls = card.calls
    .map((call) => {
      const verdicts = call.verdicts
        .map((v) => {
          const evidence = v.evidence
            .map(
              (s) =>
                `<div class="evidence">@${s.offsetSeconds}s (${s.speaker}): ${escapeHtml(s.text)}</div>`,
            )
            .join('')
          return `<div class="verdict ${v.result}">
            <div><span class="tag">${v.result}</span> ${escapeHtml(v.assertion)}</div>
            <div>${escapeHtml(v.rationale)}</div>
            ${evidence}
          </div>`
        })
        .join('')
      return `<div class="call"><h2>${escapeHtml(call.callId)}</h2>${verdicts}</div>`
    })
    .join('')

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Earwitness scorecard</title><style>${STYLE}</style></head>
<body>
<h1>Earwitness scorecard</h1>
<p class="headline">False success claims:
<strong>${card.falseSuccessClaims}</strong> of ${card.callCount} call(s) &mdash; the provider
reported success where the evidence says otherwise.<br>
Self-report disagreements in total, either direction:
<strong>${card.selfReportDisagreements}</strong>.
Result: <strong>${card.passed ? 'PASS' : 'FAIL'}</strong>.</p>
${calls}
</body></html>`
}
