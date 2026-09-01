# Brain Workshop score graph and statistics implementation

Research date: 2026-09-01. Sources are limited to the official Brain Workshop repository and its own documentation.

## Scope and canonical version

The maintained repository is [`brain-workshop/brainworkshop`](https://github.com/brain-workshop/brainworkshop). Its README calls the project “BrainWorkshop 5,” describes it as the continuation/fork of the original program, and directs users to that repository's releases ([README](https://github.com/brain-workshop/brainworkshop/blob/31b125162c63c111358ead73d9c02905363c8c1c/Readme.md#L3-L18); [source header](https://github.com/brain-workshop/brainworkshop/blob/31b125162c63c111358ead73d9c02905363c8c1c/brainworkshop.py#L4-L15)). The latest published release is [v5.0.3](https://github.com/brain-workshop/brainworkshop/releases/tag/v5.0.3), resolving to commit `31b125162c63c111358ead73d9c02905363c8c1c`; this is the reproducible baseline used below. The program itself still reports `VERSION = '5.0'` ([source](https://github.com/brain-workshop/brainworkshop/blob/31b125162c63c111358ead73d9c02905363c8c1c/brainworkshop.py#L29-L32)).

The current `master` snapshot inspected was `3476f724eb623b6e39605bd7a7e3df245787e73a`. Its statistics parsing, score formulas, aggregation, and controls are the same as v5.0.3 ([current parser/formulas](https://github.com/brain-workshop/brainworkshop/blob/3476f724eb623b6e39605bd7a7e3df245787e73a/brainworkshop.py#L1426-L1511)). Its relevant post-release change is a Pyglet 2 rendering repair that explicitly draws the average line in blue and maximum line in red ([current rendering code](https://github.com/brain-workshop/brainworkshop/blob/3476f724eb623b6e39605bd7a7e3df245787e73a/brainworkshop.py#L1724-L1739)).

## Short answer

Brain Workshop does **not** have a multi-card statistics dashboard or put Dual and Quad bests side by side. It has a full-history daily progress graph for **one exact game mode at a time**. Each calendar-training-day point contains:

- blue: mean transformed score across that day's standard sessions;
- red: maximum transformed score among that day's standard sessions;
- footer: per-modality accuracy averaged over the latest 50 standard rounds for the selected mode.

The default transformed score—what Quad Box currently calls a “threshold score”—is:

\[
S = N + \frac{p-F}{A-F}
\]

where `N` is the session's n-back level, `p` is its stored overall percentage score, `F` is the configured fallback threshold, and `A` is the configured advance threshold. Brain Workshop itself labels the graph axis only **Score**; “threshold score” is a descriptive name, not its UI term ([formula](https://github.com/brain-workshop/brainworkshop/blob/31b125162c63c111358ead73d9c02905363c8c1c/brainworkshop.py#L1533-L1549); [axis label](https://github.com/brain-workshop/brainworkshop/blob/31b125162c63c111358ead73d9c02905363c8c1c/brainworkshop.py#L1653-L1669)).

## What is stored

The graph reads the configured summary file, normally `stats.txt` for the default user or `USERNAME-stats.txt` for another profile. Each line represents one session. The documented columns are timestamp, display-mode string, overall percentage, numeric mode ID, n-back level, tenths of a second per trial, trial count, standard/manual flag, session number, and 16 per-modality percentages ([format documentation](https://github.com/brain-workshop/brainworkshop/blob/31b125162c63c111358ead73d9c02905363c8c1c/data/Readme-stats.txt#L1-L19), [column definitions](https://github.com/brain-workshop/brainworkshop/blob/31b125162c63c111358ead73d9c02905363c8c1c/data/Readme-stats.txt#L21-L81)).

The writer actually appends two additional values after those documented fields: computed session duration in seconds and a reserved zero. It also saves a separate `USERNAME-sessions.dat` pickle containing the summary, configuration, timestamp, mode, N, timing, trial count, and all trial-level stimulus/input/reaction-time arrays ([writer](https://github.com/brain-workshop/brainworkshop/blob/31b125162c63c111358ead73d9c02905363c8c1c/brainworkshop.py#L3835-L3907)). The progress graph reads only the summary text file; it does not use the detailed pickle.

Overall percentage `p` is an integer percentage. Under default scoring, Brain Workshop adds true-positive responses across all modalities, counts false positives and false negatives as errors, ignores true negatives, and computes `TP / (TP + FP + FN)`. Under Jaeggi scoring, a correct non-response is counted, each modality is scored independently, and the session percentage is the **lowest** modality percentage ([declared formulas](https://github.com/brain-workshop/brainworkshop/blob/31b125162c63c111358ead73d9c02905363c8c1c/brainworkshop.py#L245-L267); [implementation](https://github.com/brain-workshop/brainworkshop/blob/31b125162c63c111358ead73d9c02905363c8c1c/brainworkshop.py#L3336-L3407)). In v5.0.3, the graph transform uses this stored overall percentage, not an average of the per-modality percentages.

The percentage calculation is converted with `int(...)`, so a fractional result is truncated rather than rounded ([calculation](https://github.com/brain-workshop/brainworkshop/blob/31b125162c63c111358ead73d9c02905363c8c1c/brainworkshop.py#L3386-L3403)).

## Parsing, filtering, and aggregation

Whenever the graph is opened or its score style changes, `Graph.parse_stats()` rereads the whole summary file and rebuilds a dictionary for every numeric mode ID ([parser setup](https://github.com/brain-workshop/brainworkshop/blob/31b125162c63c111358ead73d9c02905363c8c1c/brainworkshop.py#L1437-L1487)). It applies these rules:

1. Blank lines, comments, and any line not beginning with a digit are skipped.
2. Both legacy tab-separated and current comma-separated records are accepted.
3. Sessions before the configured rollover hour are assigned to the previous date. The default rollover is 04:00 ([parser](https://github.com/brain-workshop/brainworkshop/blob/31b125162c63c111358ead73d9c02905363c8c1c/brainworkshop.py#L1487-L1498); [default](https://github.com/brain-workshop/brainworkshop/blob/31b125162c63c111358ead73d9c02905363c8c1c/brainworkshop.py#L502-L507)).
4. Column 7 must be `0`, so manual-mode sessions are excluded from the graph.
5. Records are grouped first by exact numeric game mode and then by adjusted date. No selectable date-range filter exists.
6. Every included session becomes `[N, overall percent, modality percentages...]`. The selected score formula is evaluated per session; each date is then reduced to `(mean(session scores), max(session scores))` ([filter and grouping](https://github.com/brain-workshop/brainworkshop/blob/31b125162c63c111358ead73d9c02905363c8c1c/brainworkshop.py#L1499-L1519); [daily reduction](https://github.com/brain-workshop/brainworkshop/blob/31b125162c63c111358ead73d9c02905363c8c1c/brainworkshop.py#L1525-L1549)).

The footer independently takes the latest 50 included modality percentages for each mode and displays their arithmetic means as whole percentages ([aggregation](https://github.com/brain-workshop/brainworkshop/blob/31b125162c63c111358ead73d9c02905363c8c1c/brainworkshop.py#L1551-L1557); [footer](https://github.com/brain-workshop/brainworkshop/blob/31b125162c63c111358ead73d9c02905363c8c1c/brainworkshop.py#L1818-L1835)). “Last 50 rounds” therefore means sessions/records, not days.

## Exact score styles

The default style is the threshold-normalized formula. Pressing `M` on the graph cycles through five internal styles ([style list](https://github.com/brain-workshop/brainworkshop/blob/31b125162c63c111358ead73d9c02905363c8c1c/brainworkshop.py#L1437-L1449); [keyboard handler](https://github.com/brain-workshop/brainworkshop/blob/31b125162c63c111358ead73d9c02905363c8c1c/brainworkshop.py#L4479-L4490)):

| Internal style | Per-session value |
|---|---:|
| `N+10/3+4/3` (default, legacy internal name) | `N + (p - F) / (A - F)` |
| `N` | `N` |
| `%` | `p / 100` |
| `N.%` | `N + p / 100` |
| `N+2*%-1` | `N - 1 + 2p / 100` |

These formulas are implemented directly in the daily reduction loop ([source](https://github.com/brain-workshop/brainworkshop/blob/31b125162c63c111358ead73d9c02905363c8c1c/brainworkshop.py#L1533-L1549)). `M` is effectively a hidden control: the on-screen help lists only `G` to return and `N` for the next game type ([help label](https://github.com/brain-workshop/brainworkshop/blob/31b125162c63c111358ead73d9c02905363c8c1c/brainworkshop.py#L1632-L1639)).

### What the thresholds mean

The same thresholds control adaptive level changes and normalize the default graph score. Standard defaults are advance `A = 80`, fallback `F = 50`, and three below-fallback sessions before lowering; Jaeggi defaults are `A = 90`, `F = 75` ([defaults](https://github.com/brain-workshop/brainworkshop/blob/31b125162c63c111358ead73d9c02905363c8c1c/brainworkshop.py#L475-L488)). The active getter selects Jaeggi values whenever Jaeggi scoring is enabled ([getters](https://github.com/brain-workshop/brainworkshop/blob/31b125162c63c111358ead73d9c02905363c8c1c/brainworkshop.py#L879-L886)). At session completion, standard mode advances immediately at `p >= A`; scores below `F` accumulate toward the configured fallback count at that N level (the code does not require them to be consecutive). Jaeggi mode lowers immediately below `F` ([adaptation logic](https://github.com/brain-workshop/brainworkshop/blob/31b125162c63c111358ead73d9c02905363c8c1c/brainworkshop.py#L3914-L3945)).

Thus the default graph transform deliberately anchors:

| Accuracy | Standard thresholds | Graph score |
|---:|---:|---:|
| 50% | fallback | `N` |
| 65% | midpoint | `N + 0.5` |
| 80% | advance | `N + 1` |
| 100% | above advance | `N + 1.6667` |

It is not accuracy and is not capped to `[N, N+1]`: a score below fallback plots below `N`, while a score above advance plots above `N+1`. Because the graph stores only `N` and `p` and recomputes this value when opened, changing the current thresholds also changes the plotted transformed values for old sessions. Brain Workshop's README recommends separate user profiles/stats files for different settings or scoring regimes ([profile guidance](https://github.com/brain-workshop/brainworkshop/blob/31b125162c63c111358ead73d9c02905363c8c1c/Readme.md#L129-L132)).

## Axes and series

- **Title/selection:** the title is the selected exact mode's long name plus “N-Back.” Opening the graph starts on the current game mode; `N` cycles to the next mode that has data, while `G`, `Esc`, or `X` closes it ([title and controls](https://github.com/brain-workshop/brainworkshop/blob/31b125162c63c111358ead73d9c02905363c8c1c/brainworkshop.py#L1616-L1669); [keyboard controls](https://github.com/brain-workshop/brainworkshop/blob/31b125162c63c111358ead73d9c02905363c8c1c/brainworkshop.py#L4479-L4490)).
- **X-axis:** adjusted calendar date, sorted ascending. Missing dates between the first and last recorded date are inserted as empty sentinel days, so spacing is calendar-linear rather than “one slot per active day.” At least two distinct dates are required ([date handling](https://github.com/brain-workshop/brainworkshop/blob/31b125162c63c111358ead73d9c02905363c8c1c/brainworkshop.py#L1671-L1715)).
- **Y-axis:** transformed score. The lower bound is the lowest daily average, floored to the nearest `0.25`; the upper bound is the highest daily maximum, ceiled to the nearest `0.25`; grid marks are every `0.25`. If both bounds are equal, the lower bound becomes zero ([bounds](https://github.com/brain-workshop/brainworkshop/blob/31b125162c63c111358ead73d9c02905363c8c1c/brainworkshop.py#L1681-L1700); [ticks](https://github.com/brain-workshop/brainworkshop/blob/31b125162c63c111358ead73d9c02905363c8c1c/brainworkshop.py#L1748-L1768)).
- **Series:** daily average in blue and daily maximum in red. Empty dates have no point, but they still consume X-axis space ([point construction](https://github.com/brain-workshop/brainworkshop/blob/31b125162c63c111358ead73d9c02905363c8c1c/brainworkshop.py#L1711-L1721); [series rendering](https://github.com/brain-workshop/brainworkshop/blob/3476f724eb623b6e39605bd7a7e3df245787e73a/brainworkshop.py#L1724-L1739)).

There are no period presets, rolling averages, session-count bars, personal-best cards, tooltips, or mode overlays in this implementation.

## Other statistics on the main screen

Brain Workshop's main screen has a few statistics separate from the daily progress graph:

- **Today's Last 20** lists the last 20 session records from the current training day across all modes. It includes manual sessions, shows the session number (or `M`), short mode plus N, and raw percentage. Standard sessions are green at or above the active advance threshold and red below the fallback threshold ([source](https://github.com/brain-workshop/brainworkshop/blob/31b125162c63c111358ead73d9c02905363c8c1c/brainworkshop.py#L3410-L3484)).
- The adjacent **mode average** selects today's last 20 sessions for the current exact numeric mode and averages only their raw N values. It includes manual sessions and does not weight by accuracy ([source](https://github.com/brain-workshop/brainworkshop/blob/31b125162c63c111358ead73d9c02905363c8c1c/brainworkshop.py#L3486-L3505)).
- **Today** and **last 24 hours** show elapsed session time and session count. These totals are populated from every row in the active user's summary file, including manual sessions and every game mode ([display](https://github.com/brain-workshop/brainworkshop/blob/31b125162c63c111358ead73d9c02905363c8c1c/brainworkshop.py#L3508-L3529); [parser](https://github.com/brain-workshop/brainworkshop/blob/31b125162c63c111358ead73d9c02905363c8c1c/brainworkshop.py#L3694-L3763)).

These main-screen figures should not be confused with the graph: only the graph excludes manual records and calculates the threshold-normalized daily average/maximum.

## Dual versus Quad and other modes

Modes are separate numeric buckets. In particular, Dual is mode `2` with position and audio modalities, while Quad is mode `28` with position, color, image, and audio. Quad Combination is yet another mode, `6` ([mode names](https://github.com/brain-workshop/brainworkshop/blob/31b125162c63c111358ead73d9c02905363c8c1c/brainworkshop.py#L1234-L1262); [modality mapping](https://github.com/brain-workshop/brainworkshop/blob/31b125162c63c111358ead73d9c02905363c8c1c/brainworkshop.py#L1264-L1292)). Crab, multi-stim, and self-paced variants receive derived numeric IDs and therefore remain separate graph buckets as well ([derived modes](https://github.com/brain-workshop/brainworkshop/blob/31b125162c63c111358ead73d9c02905363c8c1c/brainworkshop.py#L1294-L1334)).

Consequently, Brain Workshop's closest behavior for a combined “Quad Box” category is **not** two best-score cards on one page. It is separate Dual and Quad graphs selected one at a time, each with its own daily average and daily maximum. If Quad Box intentionally groups the two activities in one selector, showing separate Dual and Quad bests is a Quad Box product choice that preserves Brain Workshop's underlying mode separation while using a more modern summary layout.
