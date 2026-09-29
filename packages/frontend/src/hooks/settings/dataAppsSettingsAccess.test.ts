import { describe, expect, it } from 'vitest';
import { getDataAppsSettingsAccess } from './dataAppsSettingsAccess';
import { type SettingsContext } from './types';

type Abilities = {
    organizationDesign?: boolean;
    organization?: boolean;
    organizationChartType?: boolean;
};

const userWith = ({
    organizationDesign = false,
    organization = false,
    organizationChartType = false,
}: Abilities) =>
    ({
        ability: {
            can: (action: string, target: unknown) => {
                if (action !== 'manage') return false;
                if (target === 'OrganizationDesign') return organizationDesign;
                if (target === 'Organization') return organization;
                return (
                    typeof target === 'object' &&
                    target !== null &&
                    (target as { __caslSubjectType__?: string })
                        .__caslSubjectType__ === 'OrganizationChartType' &&
                    (target as { organizationUuid?: string })
                        .organizationUuid === 'org-1' &&
                    organizationChartType
                );
            },
        },
    }) as unknown as SettingsContext['user'];

const access = (
    abilities: Abilities,
    {
        dataApps = true,
        organizationChartTypes = true,
    }: { dataApps?: boolean; organizationChartTypes?: boolean } = {},
) =>
    getDataAppsSettingsAccess({
        user: userWith(abilities),
        organization: {
            organizationUuid: 'org-1',
        } as SettingsContext['organization'],
        dataAppsFlag: { id: 'enable-data-apps', enabled: dataApps },
        dataAppAnalysisFlag: undefined,
        organizationChartTypesFlag: {
            id: 'organization-chart-types',
            enabled: organizationChartTypes,
        },
    });

describe('getDataAppsSettingsAccess', () => {
    it('returns null when data apps are off', () => {
        expect(
            access({ organizationChartType: true }, { dataApps: false }),
        ).toBeNull();
    });

    it('allows the chart types route for organization chart type managers', () => {
        expect(access({ organizationChartType: true })).toMatchObject({
            canManageOrganizationChartTypes: true,
            landingPath: '/generalSettings/dataApps/chartTypes',
        });
    });

    it('hides the chart types route when the organization chart types flag is off', () => {
        expect(
            access(
                { organizationChartType: true },
                { organizationChartTypes: false },
            ),
        ).toMatchObject({
            canManageOrganizationChartTypes: false,
            landingPath: null,
        });
    });

    it('hides the chart types route from users who cannot manage organization chart types', () => {
        expect(access({})).toMatchObject({
            canManageOrganizationChartTypes: false,
            landingPath: null,
        });
    });

    it.each([
        {
            abilities: {
                organizationDesign: true,
                organizationChartType: true,
                organization: true,
            },
            landingPath: '/generalSettings/dataApps/themes',
        },
        {
            abilities: { organizationChartType: true, organization: true },
            landingPath: '/generalSettings/dataApps/chartTypes',
        },
        {
            abilities: { organization: true },
            landingPath: '/generalSettings/dataApps/activity',
        },
    ])(
        'lands on Themes, then Chart types, then Activity ($landingPath)',
        ({ abilities, landingPath }) => {
            expect(access(abilities)?.landingPath).toBe(landingPath);
        },
    );
});
