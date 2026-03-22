# Test Plan: Group Limit "Other" Aggregation (Codex-Validated)
- **Branch**: claude/plan-issue-13561-zpUFR
- **Date**: 2026-03-22
- **Source**: diff-analysis + cross-agent validation (Codex GPT-5.4)
- **Status**: completed

---

## Prerequisites
- [x] Docker services running
- [x] PM2 processes started
- [x] Spotlight available at http://localhost:8969
- [x] App available at http://localhost:3000
- [x] Test user: demo@lightdash.com / demo_password!
- [x] Feature flag group-limit-enabled force-enabled

## Test Results

| # | Test Case | Method | Result | Evidence |
|---|-----------|--------|--------|----------|
| 1 | UnderlyingDataModal tuple exclusion | automated | ✅ PASS | 7/7 new tests + 8/8 DrillDownModal regression |
| 2 | De Morgan → SQL compilation | automated | ✅ PASS | SqlQueryBuilder generates correct NOT IN / OR / AND |
| 3 | Exhaustive MetricType mapping | automated | ✅ PASS | All MetricType enum values handled |
| 4 | E2E Explorer group limit | manual | ✅ PASS | Chart shows credit_card, bank_transfer, Other. Math verified. |
| 5 | View Underlying Data on "Other" | manual | ✅ PASS | Total = 587.75 = coupon(145) + gift_card(442.75). No top-group leakage. |

## Detailed Evidence

### Test Case 4: E2E Explorer group limit
- Chart legend: 3 series — credit_card, bank_transfer, Other (not sentinel)
- "2 groups will be hidden" text correct
- Series config shows "Other" label, not $$_lightdash_other_$$
- Chart results tab confirms pivoted data with Other column
- **Math verification** (Other = SUM of coupon + gift_card):
  - completed: 145 + 442.75 = 587.75 ✓
  - placed: 91.64 + 208.89 = 300.53 ✓
  - shipped: 22 + 132 = 154 ✓
- PM2 logs: no errors, all 200 responses

### Test Case 5: View Underlying Data on "Other"
- Modal opened via user click on "Other" bar for "completed" status
- All visible rows show status = "completed" (correct filter)
- Total order amount = 587.75 — exact match to Other aggregation
- No credit_card or bank_transfer text in modal content
- Confirms De Morgan exclusion filters work end-to-end

## Code Changes
1. Extracted shared `buildPivotFilters` utility (pivotFilters.ts)
2. Added 7 unit tests for pivot filter building (pivotFilters.test.ts)
3. Added De Morgan → SQL compilation test (SqlQueryBuilder.test.ts)
4. Added exhaustive MetricType coverage test (derivePivotConfigFromChart.test.ts)
5. Refactored UnderlyingDataModal and drillDownFilters to share implementation

## Coverage Summary
- Happy path: 3 tests (1, 4, 5) — all passed
- Edge cases: 1 test (2) — passed
- Regression: 1 test (3) — passed
- Cross-agent identified: 3 tests (1, 2, 5)

## Method Breakdown
- Automated: 3 tests (1, 2, 3) — all passed
- Manual: 2 tests (4, 5) — all passed
