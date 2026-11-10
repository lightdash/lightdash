import { areOrganizationGroupsAvailable } from './groupsAvailable';

test.each([true, false])(
    'groups need a valid licence (valid %s)',
    async (valid) => {
        expect(
            await areOrganizationGroupsAvailable({
                isLicensed: () => valid,
            }),
        ).toBe(valid);
    },
);
