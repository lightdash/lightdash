# Test Plan: Frontend Column Limit for Pivoted Queries
- **Branch**: prod-6298
- **Date**: 2026-03-25
- **Source**: diff-analysis
- **Status**: completed

---

## Test Cases

### Test Case 1: Cartesian chart — column limit filters pivot series
**Method**: manual | **Category**: happy-path
### Test Case 2: Column limit persists after save/reload
**Method**: manual | **Category**: happy-path
### Test Case 3: UI visibility — only with pivot + flag
**Method**: manual | **Category**: happy-path
### Test Case 4: getExpectedSeriesMap — columnLimit slicing
**Method**: automated | **Category**: happy-path
### Test Case 5: convertSqlPivotedRowsToPivotData — columnLimit filtering
**Method**: automated | **Category**: happy-path
### Test Case 6: Default behavior — no columnLimit leaves all columns
**Method**: manual | **Category**: regression
