# Brain Workshop 4.8.1 progress graph

Research date: 2026-09-16

## Scope and source

This note covers the exact Brain Workshop 4.8.1 source archive supplied for this investigation, not a newer fork or release. The archive is the official SourceForge download: [brainworkshop-4.8.1.zip](http://downloads.sourceforge.net/brainworkshop/brainworkshop-4.8.1.zip). Its SHA-256 is `6413a71c02b435c52f799b3fbb73bb6fdc6669dd680c3f9418ce7d8ab1e55f40`. The extracted program identifies itself as version `4.8.1` (`brainworkshop.pyw`, lines 1-17).

All line references below are to files inside that archive:

- `brainworkshop/brainworkshop.pyw`
- `brainworkshop/data/Readme-stats.txt`
- `brainworkshop/Readme.txt`

Only those primary sources were used.

## Short answer

Brain Workshop 4.8.1 does **not** plot separate series for 1-back, 2-back, and so on. It converts every session into one level-adjusted scalar that includes both N and accuracy, then plots two series for the selected game mode:

- blue: the mean of those session scores for the training day;
- red: the maximum session score for the training day.

The default per-session formula is:

\[
S = N + \frac{\bar{P}-F}{A-F}
\]

where `N` is the session's n-back level, `P̄` is the mean of its nonzero per-modality percentage scores, `F` is the active fallback threshold, and `A` is the active advance threshold. The source implements this as slope `1/(A-F)`, intercept `-F/(A-F)`, and `N + intercept + slope * mean(percentages)` (`brainworkshop.pyw`, lines 1208-1233). The default style is the first style in the list and is selected with `self.style = 0` (`brainworkshop.pyw`, lines 1120-1132).

With the ordinary defaults `A = 80` and `F = 50`, the formula anchors 50% at `N`, 65% at `N + 0.5`, and 80% at `N + 1`. It is not capped: 100% produces `N + 1.6667`. The configured ordinary and Jaeggi defaults are 80/50 and 90/75 respectively (`brainworkshop.pyw`, lines 343-356), and the active threshold getters switch between them according to the scoring mode (`brainworkshop.pyw`, lines 679-686).

For the example that motivated this research, 1-back at 100% maps to about `2.667`, while 2-back at 60% maps to about `2.333` under the ordinary defaults. Brain Workshop therefore differentiates the levels, but it would show the latter as a decline. This is an important property of its threshold-normalized scale, not a separate-level plotting scheme.

## Input data and percentages

The summary stats file has one row per session. Its documented columns include timestamp, overall percentage, numeric game mode, N, standard/manual status, session number, and 16 per-modality percentages (`data/Readme-stats.txt`, lines 14-19 and 21-79).

The session-completion code calculates each modality percentage as integer `100 * right / (right + wrong)`, truncating any fractional part (`brainworkshop.pyw`, lines 2924-2932). Under ordinary scoring, true positives count as right; false positives and false negatives count as wrong; true negatives are ignored. The stored overall percentage is calculated from rights and wrongs aggregated across modalities (`brainworkshop.pyw`, lines 2877-2907 and 2928-2941). Under Jaeggi scoring, correct non-responses also count and the stored session percentage is the lowest modality percentage (`brainworkshop.pyw`, lines 2892-2901 and 2934-2940). The file writer records the overall percentage followed later by all modality percentages (`brainworkshop.pyw`, lines 3373-3411).

The progress graph in 4.8.1 does **not** use that stored overall percentage column. Its in-memory entry is `[N, selected-mode modality percentages...]`, and every graph style that uses accuracy calculates it from the mean of those modality values (`brainworkshop.pyw`, lines 1187-1200 and 1216-1233). For Quad specifically, mode 28 contains position, color, image, and audio (`brainworkshop.pyw`, lines 896-975).

There is a source-level edge case worth avoiding: the parser removes every zero from each entry before calculating the graph score. Its own comment acknowledges the assumption that a person did not genuinely score 0% on a modality (`brainworkshop.pyw`, lines 1216-1219). As a result, an active modality scored at 0% is omitted from `P̄`, which biases the graph upward. The raw per-modality values retained for the “Last 50 rounds” footer do not undergo that zero filtering (`brainworkshop.pyw`, lines 1192-1200 and 1235-1241).

## Filtering and daily aggregation

`Graph.parse_stats()` rereads the configured stats file and rebuilds a dictionary for every numeric game mode (`brainworkshop.pyw`, lines 1134-1138 and 1155-1169). It then applies these rules:

1. Blank lines and lines not beginning with a digit are skipped (`brainworkshop.pyw`, lines 1170-1173).
2. A session before the configured rollover hour is assigned to the preceding training day (`brainworkshop.pyw`, lines 1174-1177). The default rollover is 04:00 (`brainworkshop.pyw`, lines 370-375).
3. Both legacy tab-separated and comma-separated rows are accepted (`brainworkshop.pyw`, lines 1178-1181).
4. Only standard sessions are included; a nonzero manual-mode field causes the row to be skipped (`brainworkshop.pyw`, lines 1182-1186). The stats format defines column 7 as `0 = Standard mode, 1 = Manual mode` (`data/Readme-stats.txt`, line 58).
5. Sessions are bucketed first by exact numeric game mode and then by adjusted date. N is retained inside each session entry; it is not a grouping key or filter (`brainworkshop.pyw`, lines 1187-1200).
6. Each session is transformed with the selected score formula. All transformed scores on the same date become `(mean(scores), max(scores))` (`brainworkshop.pyw`, lines 1216-1233).

There is no date-range selector and no N-level selector. Pressing `N` while viewing the graph cycles to the next exact game mode with data, not the next n-back level (`brainworkshop.pyw`, lines 1140-1153 and 4007-4018). Opening the graph starts on the currently selected game mode (`brainworkshop.pyw`, lines 3992-3996 and 4045-4049).

## Alternate measures

The graph initializes these five styles and pressing `M` cycles through them, reparsing the entire stats file (`brainworkshop.pyw`, lines 1120-1132 and 4014-4018):

| Internal style | Per-session value |
|---|---:|
| `N+10/3+4/3` (default) | `N + (P̄ - F) / (A - F)` |
| `N` | `N` |
| `%` | `P̄ / 100` |
| `N.%` | `N + P̄ / 100` |
| `N+2*%-1` | `N - 1 + 2P̄ / 100` |

The implementations are adjacent in `brainworkshop.pyw`, lines 1220-1233. Despite switching measures, the on-screen vertical label remains “N-Back,” and the source itself prints a FIXME about changing labels (`brainworkshop.pyw`, lines 1129-1132 and 1345-1349). The visible help mentions only `G` and `N`, so the `M` measure switch is effectively undisclosed in the graph UI (`brainworkshop.pyw`, lines 1312-1319).

The changelog says version 4.8 changed graph scoring so that percentage correct affects the exact score as well as N (`Readme.txt`, lines 78-82). An older changelog entry documents the historical formula `(N - 1) + percentage / 100` (`Readme.txt`, lines 291-295), but that is not the default 4.8.1 implementation and should not be attributed to this release's default graph.

## Plot construction

The graph title is the selected exact game mode plus “N-Back” (`brainworkshop.pyw`, lines 1301-1325). It requires data on at least two dates (`brainworkshop.pyw`, lines 1351-1359).

The vertical range starts at the lowest daily average and ends at the highest daily maximum, rounded outward to quarter-point increments. If both bounds are equal, the lower bound is set to zero (`brainworkshop.pyw`, lines 1361-1376). Horizontal grid labels are spaced every `0.25` (`brainworkshop.pyw`, lines 1290-1292 and 1421-1437).

Missing calendar dates between the first and last recorded dates are inserted as `(-1, -1)` sentinels so that they consume horizontal space (`brainworkshop.pyw`, lines 1382-1389). The plot skips points for those dates but still builds each result as one line strip, so the line visually connects the surrounding active dates across the empty interval (`brainworkshop.pyw`, lines 1391-1401 and 1439-1446).

The legend labels maximum in red and average in blue (`brainworkshop.pyw`, lines 1281-1282 and 1333-1343). Both line series receive a small square marker at each actual date (`brainworkshop.pyw`, lines 1450-1473).

The footer is independent of daily aggregation. For each modality in the selected mode, it takes the most recent 50 included standard-session percentages and appends their arithmetic mean (`brainworkshop.pyw`, lines 1235-1241). Because this is Python 2 integer division over integer values, the displayed result is truncated to a whole percentage. The footer labels this “Last 50 rounds” (`brainworkshop.pyw`, lines 1477-1494).

## Implications for Cognitive Suite

The closest faithful adaptation is a **single level-adjusted performance chart**, not a set of lines split by N:

- transform each completed session into an effective-level score containing both N and accuracy;
- aggregate that transformed score into daily average and daily best;
- show the raw session/day percentage and N explicitly in the tooltip so the combined number remains interpretable;
- retain exact exercise-mode separation, as Brain Workshop does, but do not group by N;
- include 0% modality/session values rather than reproducing Brain Workshop's zero-filtering bug.

Whether Cognitive Suite should use Brain Workshop's exact default transform is a product choice. It accurately preserves both inputs, but its threshold normalization can make 1-back at 100% plot above 2-back at 60%. If the desired semantic is that every higher N should always plot at least as high as every lower N, a bounded mapping such as `(N - 1) + percentage / 100` provides that ordering, but it is the historical formula cited in the changelog—not the 4.8.1 default. In either case, a plain percentage-only series cannot encode a change of N by itself.
