# AI credits

How AI usage on Lightdash-managed keys is measured in credits, what an
organization is allowed to use, and how AI is paused. Credits are never
stored: every amount is derived from the usage ledger and the rate card.

## Language

**Credit**:
The unit an organization's AI usage is measured and allowed in. Derived per
call from its token counts and the rate card in force when the call was made.
_Avoid_: token cost, balance

**Rate card**:
Effective-dated credits per million tokens for each provider and model. A
price change is a new row, never an edit. A model with no row is unpriced and
counts as zero.
_Avoid_: price list, pricing table

**Usage ledger**:
One row per AI call, written off the request path. The only source credits
are summed from.

**Billable call**:
A completed call on a Lightdash-managed key for a billable feature. Calls on
a self-managed key, failed calls and background features are recorded but
never charged.
_Avoid_: paid call, charged call

**Entitlement**:
One organization's allowance over one period, written by Console. Periods
may overlap, for example a monthly reset inside an annual pool; each
allowance applies on its own.
_Avoid_: plan, subscription, quota

**Period**:
The half-open time range an entitlement covers, from period start up to but
not including period end.
_Avoid_: window, cycle

**Allowance**:
The credits an entitlement allows in its period. Null until one is agreed,
and a null allowance never pauses anything.
_Avoid_: limit, budget, cap

**Hold**:
A pause on AI for an organization, or for one user in it, with a fixed
reason, optional operator notes that customers never see, and an optional
expiry. A hold is active until it is released or expires. The usage sink
places one `allowance_exhausted` hold per exhausted entitlement, expiring at
the end of its period.
_Avoid_: block, freeze, suspension
