# Final regression activity audit

Audited against AGENT_BRIEF.md, outputs/SCHEMA.md, and check.md on October 25, 2026.

## Result

No known numerical or required-control defects remain in the executed local checks. The supplied outputs (including SCHEMA.md) and m10.js match their pre-audit SHA-256 hashes. No models were trained and no original output files were changed.

## Implementation fixes

- Prevented stale asynchronous loads from replacing the newest dataset/person/model selection. A regression test deliberately overlaps three cold loads with different response delays.
- Added a loading/busy state, a handled data-load error, and a reload/retry button. Previously a failed load left an unhandled rejection and no recovery UI. A reload is necessary because the unchanged instructor loader caches requests, including failures.
- Kept the linear prediction announcement mounted while updating results so assistive technology has a persistent live region.
- Made the wide coefficient table a named, keyboard-focusable scrolling region.
- Strengthened input/select/button border contrast (3.43:1 on the light surface, 4.74:1 on the dark surface).
- Added a self-contained favicon to avoid an unnecessary missing-icon request.

Changed production files: app.js, styles.css, index.html. Added reusable tests: tests/audit.js and tests/run_audit.py.

## Checks actually executed

Run `python tests/run_audit.py --all` from the project folder. It requires Python and Chrome; use `--chrome PATH` for another Chrome installation. No third-party Python packages or production dependencies are needed. The runner serves the repository under a URL subdirectory, temporarily builds a browser fixture, launches headless Chrome, and removes the fixture afterward.

The final run passed 15,624 assertions for each of these configurations:

- Desktop: 1424 CSS pixels wide, light theme.
- Narrow: 500 CSS pixels wide, light theme.
- Narrow: 500 CSS pixels wide, dark theme.

Each complete run covered all 45 model/dataset/person combinations and:

- Linear baseline versus intercept + coefficients times training references; every signed feature push; every grouped category push; baseline + pushes = prediction. Comparisons with stored rounded predictions allow 0.001 target units.
- All category levels, valid single-category encodings, displayed reference groups (source review), grouped waterfall counts, numeric edits, empty/out-of-range handling, reset, and retained focus while editing.
- All 1,500 partial forest averages: N=1 through 100 for each of the 15 supplied people, compared with direct arithmetic and m10.runningAverage. Partial/Full forest labels, inclusion counts, all individual tree values, and stable slider identity/focus were checked.
- All 7,500 staged boosting correction identities, within 0.0002 target units to allow independently rounded bundle fields. The UI was checked at rounds 0, 1, 2, best-1, best, best+1, 250, 499, and 500. Corrections were read directly and never scaled again.
- Previous/next buttons and disabled endpoints, reset to round 0, validation-best button, selected training/validation RMSE, lowest validation RMSE and its round.
- All required check.md values across all three sections, including biggest upward linear push and tree 1 alone.
- Original-person forest/boosting results after leaving edited linear inputs; Example person 4 reviewer shortcut; category/data disclosure controls; skip link preserving the current model.
- Unique IDs, labels for all inputs/selects, valid ARIA reference targets, accessible SVG titles/descriptions, active navigation state, and document overflow. Chart/table overflow stays in named scrolling regions.
- No JavaScript error events, unhandled promise rejections, or console errors in normal runs.

Additional executed checks:

- Ten static assets returned HTTP 200 under a repository-style subpath: index.html, app.js, m10.js, styles.css, three bundles, and three boosting-tree exports. All six JSON files parsed.
- Cold direct #forest and #boosting loads passed with functioning selectors and accessibility structure.
- An intentionally rejected data request showed the error message and recovery button without an unhandled rejection. One deliberate console diagnostic was expected in this failure-only test.
- Computed text contrast for primary/muted/accent/positive/negative colors on the main light and dark surfaces exceeded 4.5:1. This is a palette check, not a full WCAG conformance audit.
- Protected-file hashes were checked after all fixes.

RMSE validation checks confirm the supplied sequences, nonnegative finite values, UI values/units, and minimum selection. RMSE was not independently recomputed over all raw training/validation rows: that would require predictions for every row, beyond the supplied per-person app arrays. No retraining was performed.

## Example person 1 checkpoints

| Dataset / units | Linear baseline / prediction / biggest upward push | Forest / tree 1 | Boosting rounds 0 / 1 / 500 | Minimum validation RMSE / round |
|---|---|---|---|---|
| Glucose / mg/dL | 113.8 / 99.4 / Waist +1.4 | 108.6 / 110.0 | 113.8 / 112.4 / 102.5 | 20.4 / 21 |
| Blood pressure / mmHg | 125.9 / 123.3 / Race or ethnicity +1.3 | 119.6 / 131.3 | 125.9 / 125.7 / 127.1 | 16.1 / 38 |
| Lung function / mL | 2878.6 / 3217.9 / Sex +390.2 | 1982.5 / 2003.0 | 2878.6 / 2784.0 / 1831.8 | 537.7 / 79 |

The lung-function linear mismatch is preserved and explained. Category pushes use the training mix, while coefficients compare against the coding reference group. Forest disagreement is explicitly distinguished from calibrated uncertainty. Boosting fits training residuals and uses validation-based stopping, not test error. No learning-rate comparison or unsupported custom forest/boosting prediction controls were introduced.

## Remaining manual checklist

- [ ] Test actual keyboard navigation (Tab, Shift+Tab, arrow keys, Enter/Space), including disclosures, sliders, and horizontally scrolling chart/table regions. Automated checks used programmatic focus and input/click events rather than real keypresses.
- [ ] Test screen-reader announcements, chart descriptions, focus order, and recovery messaging with NVDA or VoiceOver. Structural checks alone do not establish assistive-technology usability.
- [ ] Inspect real phones at 320-390 CSS pixels, touch dragging, browser zoom at 200%/400%, and long labels. The executed responsive matrix reached 500px; narrower physical devices were not tested in this audit.
- [ ] Check Safari, Firefox, and Edge. Executed browser tests used headless Chrome only.
- [ ] Publish and open the actual GitHub Pages link in an incognito window without signing in. Verify all three hash links, selectors, and JSON requests there. Local subdirectory hosting is not a live deployment test.
- [ ] Have an unfamiliar reader complete each learning objective and the Glucose Example person 4 reviewer task without help.
- [ ] Commit and push app.js, index.html, styles.css, tests, and this report; then repeat the public-link smoke test.

These are verification gaps, not confirmed remaining numerical defects. Keep chart scrolling on narrow screens: it preserves readable axes, labels, and exact-value tables.
