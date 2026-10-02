# People adoption: current organization population

This is the first independently shippable slice of PROD-11653. It answers
current-population questions without dropping members who generated no events.
It does not implement historical person-day eligibility or HR team adoption.

## Population and windows

One row per current non-internal organization membership. Eligible means an
active, setup-complete user; pending setup and inactive accounts remain visible
but are excluded from adoption. A group membership is not an HR team and an
organization role is not a business-user classification. Customers can filter
roles or the JSON group UUID list explicitly. No arbitrary user attributes,
email addresses, prompts, SQL or credentials are exported.

The membership snapshot is observed during the nightly dimension refresh.
Activity windows end at the UTC midnight preceding that observation: the last
1, 7 or 30 **closed** days. Current-day events are excluded. The current
population is the denominator for each window, not the population at a
historical period end. Role/group filters apply to both numerator and denominator.
Do not use the snapshot date as a historical DAU/WAU/MAU time series.

## Activity rules

- Human: explicitly qualifying content fetches by registered users, query
  outcomes with interactive origin and user actor, and human agent request
  creation from the web app or Slack. Failed interactive requests still show
  a person's activity.
- System: scheduled/auto-refreshed queries and explicit system/service actors.
- Inferred: registered-user MCP calls, user-attributed app loads/build actions,
  and user-attributed app/MCP query origins. App previews and automated API
  calls cannot yet be separated reliably.
- Unknown: old/unclassified query activity (including unclassified Sheets
  requests) and content fetches without qualifying context.
- AI token/step totals and request lifecycle outcomes are not additional human
  actions. Anonymous/external identities do not create eligible members.

Each person's facts are reduced to distinct UTC activity days before joining.
Duplicates and usage across projects do not multiply members or active days.
First/last activity refer to **observed human activity**, not login or first-ever
use. Inferred, system and unknown last-activity timestamps remain separate.
No observed activity is not proof of never having used Lightdash. Missing
partitions remain a coverage limitation; they do not prove inactivity.

Returning people (7d) were observed before the trailing seven-day window and
again inside it. Lapsed people (30d) have observed historical human activity
but none in the trailing 30 days. These are current-population indicators, not
historical retention cohorts. Agent share (30d) divides eligible agent
requesters by eligible human-active people in that same window.

## Refresh and historical foundation

The existing organization-flag-gated nightly dimension refresh exports the population
in pages of 1,000, enriching groups once per page. Each read-only page retains
its existing 5-second statement and 1-second lock timeout. No transaction spans
file or storage IO; there is no per-person database query.

After the complete export is converted to typed Parquet, the refresher writes:

- `model=people_membership/dt=YYYY-MM-DD/snapshot.parquet`: the latest complete
  observation on that UTC day, retained for the historical follow-up.
- `dim=people/people.parquet`: the latest current population for this Explore.

Both are within the existing compacted organization prefix. An interrupted
export publishes neither file. History publishes before current; failed
publication leaves the previous current snapshot in place. Empty snapshots
are valid complete exports. Same-day reruns replace that day's observation;
missed days are not backfilled with today's membership. These are observed
snapshots, not exact change-event validity intervals or continuous history.
The current Explore signs only the latest snapshot; history cannot accidentally
multiply its denominator or add Parquet reads to every analytics query.

Activity is reduced at query time from retained compacted streams. First/last
observed activity therefore still requires reading historical activity; this
is not a constant-cost incremental person-day aggregate. Large-deployment
storage and query performance must be assessed under PROD-11701 before app
rollout. Local in-memory timings exclude remote listing, reads and network IO.
Capture begins when the organization flag is enabled; the seven-day processing
catch-up limit does not delete retained history or shorten these reporting
windows. A newly enabled organization does not yet have a full 30-day capture window.

## Example

Select **User name**, **User UUID**, **Organization role**, **Activity status**,
**Last observed activity at**, and **Eligible people**. Filter **Is eligible**
to true to see the population including zero-event users. Select **Eligible
people**, **Active people 30d**, and **Observed adoption (30d)** without user
dimensions for the headline ratio. Filter the quoted UUID in **Group IDs** to
select a particular group. Use **User UUID** to distinguish matching names.

For a seven-day return indicator, select **Returning people 7d** alongside
**Active people 7d**; for agent adoption select **Agent users 30d** and
**Agent share of active people (30d)**. Rates with an empty denominator are null.

## Remaining PROD-11653 scope

Historical membership/role/group validity intervals, effective project access
(including inherited/custom access), person-day eligibility, arbitrary-period
end populations, actual weekly retention cohorts, and explicit customer HR
classification remain follow-up work. Additional capture must resolve inferred
app/API/Sheets activity before claiming complete human adoption. Pre-capture
history and unobserved changes between snapshots cannot be reconstructed.
