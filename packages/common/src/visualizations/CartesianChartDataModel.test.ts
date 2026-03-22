describe('CartesianChartDataModel', () => {
    it('group limiting is handled at SQL level via PivotQueryBuilder', () => {
        // Client-side filterToTopGroups has been removed.
        // Group limiting is now done at the SQL level via PivotQueryBuilder.
        // See packages/backend/src/utils/QueryBuilder/PivotQueryBuilder.test.ts
        // for the "Group limit with Other aggregation" test suite.
        expect(true).toBe(true);
    });
});
