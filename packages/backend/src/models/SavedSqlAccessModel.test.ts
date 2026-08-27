import { canReceiveSavedSqlDirectAccess } from './SavedSqlAccessModel';

describe('canReceiveSavedSqlDirectAccess', () => {
    it.each([
        {
            ownership: { spaceUuid: 'space-uuid', dashboardUuid: null },
            expected: true,
        },
        {
            ownership: { spaceUuid: null, dashboardUuid: 'dashboard-uuid' },
            expected: false,
        },
        {
            ownership: { spaceUuid: null, dashboardUuid: null },
            expected: false,
        },
        {
            ownership: {
                spaceUuid: 'space-uuid',
                dashboardUuid: 'dashboard-uuid',
            },
            expected: false,
        },
    ])('returns $expected for $ownership', ({ ownership, expected }) => {
        expect(canReceiveSavedSqlDirectAccess(ownership)).toBe(expected);
    });
});
