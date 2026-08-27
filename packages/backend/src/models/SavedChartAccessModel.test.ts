import { canReceiveSavedChartDirectAccess } from './SavedChartAccessModel';

describe('canReceiveSavedChartDirectAccess', () => {
    it.each([
        {
            ownership: { spaceId: 1, dashboardUuid: null },
            expected: true,
        },
        {
            ownership: { spaceId: null, dashboardUuid: 'dashboard-uuid' },
            expected: false,
        },
        {
            ownership: { spaceId: null, dashboardUuid: null },
            expected: false,
        },
        {
            ownership: { spaceId: 1, dashboardUuid: 'dashboard-uuid' },
            expected: false,
        },
    ])('returns $expected for $ownership', ({ ownership, expected }) => {
        expect(canReceiveSavedChartDirectAccess(ownership)).toBe(expected);
    });
});
