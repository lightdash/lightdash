# Slug-Based Testing Guide

This document outlines the comprehensive test coverage for slug-based functionality in Lightdash dashboards and charts.

## Overview

Lightdash supports accessing dashboards and charts using slugs (human-readable identifiers) instead of UUIDs. For example:
- **UUID**: `/projects/123/dashboards/abc-def-123-456`
- **Slug**: `/projects/123/dashboards/jaffle-dashboard`

Both approaches are supported for backward compatibility.

## Test Coverage

### 1. Dashboard Tests (`cypress/e2e/app/dashboard.cy.ts`)

Added 5 new test cases:

#### a. Basic Slug Access
- **Test**: `Should access dashboard by slug instead of UUID`
- **Coverage**: Verifies that dashboards can be accessed via slug and render correctly
- **Key Assertions**: Dashboard loads, tiles render, charts display

#### b. Filter Persistence with Slugs
- **Test**: `Should maintain dashboard filters when using slug`
- **Coverage**: Ensures dashboard filters work correctly when using slug-based URLs
- **Key Assertions**: Filters apply, URL contains slug + filters, reload preserves state

#### c. API Access via Slug
- **Test**: `Should access dashboard via API using slug`
- **Coverage**: Tests the REST API endpoint with slug parameter
- **Key Assertions**: API returns correct dashboard, includes slug and UUID

#### d. Error Handling
- **Test**: `Should handle invalid dashboard slug gracefully`
- **Coverage**: Verifies proper error messages for non-existent slugs
- **Key Assertions**: Error message displays appropriately

### 2. Chart Tests (`cypress/e2e/app/chartSlugs.cy.ts`)

Created a new test file with 10 comprehensive test cases:

#### Basic Functionality
1. **Slug Access**: Access saved charts via slug URL
2. **Chart Editing**: Edit charts accessed by slug
3. **API Access**: Fetch charts via API using slug
4. **Error Handling**: Handle invalid slugs gracefully

#### Advanced Functionality
5. **URL Sharing**: Share chart URLs using slugs
6. **Query Execution**: Run chart queries with slug-based access
7. **Scheduled Delivery**: Create schedules for slug-accessed charts
8. **CSV Export**: Export chart data when accessed by slug
9. **Dashboard Integration**: Add slug-accessed charts to dashboards

### 3. API Tests (`cypress/e2e/api/slugs.cy.ts`)

Created a comprehensive API test suite with 16 test cases organized into 5 sections:

#### Dashboard API Tests
1. Get dashboard by slug
2. Get dashboard by UUID (backward compatibility)
3. Handle non-existent slug (404 error)
4. Update dashboard accessed by slug
5. Get dashboard views using slug

#### Chart API Tests
6. Get chart by slug
7. Get chart by UUID (backward compatibility)
8. Handle non-existent slug (404 error)
9. Update chart accessed by slug
10. Get chart history using slug-derived UUID
11. Get chart filters using slug-derived UUID

#### Interchangeability Tests
12. Verify slug and UUID return same dashboard
13. Verify slug and UUID return same chart

#### List Endpoint Tests
14. Verify slugs are included in dashboard list
15. Verify slugs are included in chart summaries

### 4. Extended Dashboard API Tests (`cypress/e2e/api/dashboard.cy.ts`)

Added 3 new test cases to the existing API test suite:

1. **Get Dashboard by Slug**: Basic API access test
2. **Create and Access by Slug**: Full lifecycle test (create → access via slug)
3. **Update via Slug**: Modify dashboard using slug, verify via UUID

## API Endpoints Supporting Slugs

### Dashboards
- `GET /api/v1/dashboards/:dashboardUuidOrSlug`
- `PATCH /api/v1/dashboards/:dashboardUuidOrSlug`
- Returns: Dashboard object with both `uuid` and `slug` fields

### Charts
- `GET /api/v1/saved/:savedQueryUuidOrSlug`
- `PATCH /api/v1/saved/:savedQueryUuidOrSlug`
- Returns: Chart object with both `uuid` and `slug` fields

### SQL Charts
- `GET /api/v1/projects/:projectUuid/sqlRunner/saved/slug/:slug`
- Separate endpoint specifically for slug-based access

## Where Else to Add Tests

### 1. Integration Tests
**Location**: `packages/backend/src/services/DashboardService/DashboardService.test.ts`

Suggested tests:
```typescript
describe('getByIdOrSlug', () => {
    it('should get dashboard by slug', async () => {
        // Test service layer slug resolution
    });
    
    it('should get dashboard by UUID', async () => {
        // Test backward compatibility
    });
});
```

### 2. Model Layer Tests
**Location**: `packages/backend/src/models/DashboardModel/DashboardModel.test.ts`

Suggested tests:
```typescript
describe('DashboardModel.getByIdOrSlug', () => {
    it('should query by slug when slug provided', async () => {
        // Test database query logic
    });
});
```

### 3. Frontend Unit Tests
**Location**: `packages/frontend/src/hooks/dashboard/useDashboard.test.ts`

Suggested tests:
```typescript
describe('useDashboardQuery with slug', () => {
    it('should fetch dashboard using slug', async () => {
        // Test React hook behavior
    });
});
```

### 4. Search Functionality
**Location**: `packages/e2e/cypress/e2e/api/search.cy.ts`

Consider adding:
- Search results should include slugs
- Clicking search result should navigate to slug URL

### 5. Embedding Tests
**Location**: `packages/e2e/cypress/e2e/app/embed.cy.ts` (if exists)

Consider adding:
- Embedded dashboards accessible via slug
- Embedded charts accessible via slug

### 6. Scheduler Tests
**Location**: `packages/backend/src/scheduler/SchedulerTask.test.ts`

Consider adding:
- Scheduled deliveries work with slug-based references
- Dashboard/chart resolution in scheduler uses slugs

### 7. Content as Code Tests
**Location**: `packages/e2e/cypress/e2e/api/contentAsCode.cy.ts`

Already has some slug tests! Consider expanding:
- Upload content using slugs
- Download specific items by slug
- Slug preservation during sync

### 8. Permission/Access Control Tests
**Location**: `packages/backend/src/services/PermissionsService/PermissionsService.test.ts`

Consider adding:
- Access checks work correctly with slugs
- Private dashboard slug access denied appropriately

### 9. Analytics Tests
**Location**: `packages/backend/src/analytics/`

Consider verifying:
- View events tracked correctly for slug-based access
- Analytics differentiate between UUID and slug access patterns

### 10. Migration Tests
**Location**: `packages/backend/src/database/migrations/`

Consider adding:
- Slug generation for existing content
- Slug uniqueness constraints
- Slug update on name change

## Test Data Reference

### Seed Dashboards
- **Name**: "Jaffle dashboard"
- **Slug**: `jaffle-dashboard`

### Seed Charts
- **Name**: "How much revenue do we have per payment method?"
- **Slug**: `how-much-revenue-do-we-have-per-payment-method`

- **Name**: "How many orders we have over time?"
- **Slug**: `how-many-orders-we-have-over-time`

- **Name**: "Which customers have not recently ordered an item?"
- **Slug**: `which-customers-have-not-recently-ordered-an-item`

## Running the Tests

### Run all slug-related tests
```bash
# Dashboard tests
pnpm test:e2e --spec "cypress/e2e/app/dashboard.cy.ts"

# Chart slug tests
pnpm test:e2e --spec "cypress/e2e/app/chartSlugs.cy.ts"

# API slug tests
pnpm test:e2e --spec "cypress/e2e/api/slugs.cy.ts"

# Extended dashboard API tests
pnpm test:e2e --spec "cypress/e2e/api/dashboard.cy.ts"
```

### Run all E2E tests
```bash
pnpm test:e2e
```

## Key Implementation Details

### Backend
1. **Router Level**: `dashboardRouter.ts` and `savedChartRouter.ts` accept `/:idOrSlug` parameter
2. **Service Level**: `DashboardService.getByIdOrSlug()` and `SavedChartService.get()` handle slug resolution
3. **Model Level**: `DashboardModel.getByIdOrSlug()` and `SavedChartModel.get()` query by slug or UUID

### Frontend
1. **URL Routing**: React Router accepts both slugs and UUIDs in path parameters
2. **Hooks**: `useDashboardQuery()` and `useSavedQuery()` work with both identifiers
3. **API Calls**: `lightdashApi` sends slug or UUID to backend

## Best Practices

1. **Always test both slug and UUID** - Ensure backward compatibility
2. **Test error cases** - Invalid slugs, non-existent resources
3. **Test state persistence** - Filters, parameters, view state
4. **Test API and UI** - Both layers should support slugs
5. **Test cross-references** - Charts in dashboards, dashboard tiles, etc.

## Future Considerations

1. **Slug conflicts** - How are duplicate slugs handled?
2. **Slug changes** - What happens when a dashboard/chart is renamed?
3. **Redirects** - Should old slugs redirect to new ones?
4. **Analytics** - Track slug usage vs UUID usage
5. **Performance** - Any performance impact of slug lookups vs UUID?

## Contributing

When adding new features that involve dashboards or charts:
1. Ensure slug support is included
2. Add corresponding tests to the appropriate test files
3. Update this guide if new test patterns emerge
4. Consider both API and UI test coverage

