import { Ability } from '@casl/ability';
import {
    type LightdashUserWithAbilityRules,
    DbtProjectType,
    DbtVersionOptionLatest,
    ProjectType,
    WarehouseTypes,
} from '@lightdash/common';
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { type SettingsContext } from './types';
import { useSettingsNavigation } from './useSettingsNavigation';

const { mockUserResponse } = await vi.importActual<{
    mockUserResponse: () => LightdashUserWithAbilityRules;
}>('../../testing/__mocks__/api/userResponse.mock');

vi.mock('../../providers/Tracking/useTracking', () => ({
    default: () => ({ track: vi.fn() }),
}));

const settingsContext = (
    overrides: Partial<SettingsContext> = {},
): SettingsContext => ({
    aiPrincipalsEnabled: false,
    user: undefined,
    health: undefined,
    organization: undefined,
    project: undefined,
    showImpersonationPanel: false,
    isCustomRolesEnabled: false,
    isProLimitsEnabled: false,
    canAccessAnalyticsSettings: false,
    isAnalyticsProjectFlagLoading: false,
    isOrganizationRoadmapEnabled: false,
    canAccessAiCredits: false,
    isAiCreditsLoading: false,
    isSsoOrganizationSettingsEnabled: false,
    isEmailWhitelabelEnabled: false,
    isScimTokenManagementEnabled: undefined,
    isServiceAccountsEnabled: false,
    isAiCopilotEnabledOrTrial: true,
    shouldShowAiAgentReviews: false,
    canManageOrgAiAgent: true,
    hasAnyAiAgentAccess: true,
    isAiOrganizationSettingsLoading: false,
    dataAppsFlag: undefined,
    dataAppAnalysisFlag: undefined,
    isDataAppsFlagLoading: false,
    externalSourcesFlag: undefined,
    isResultsCacheEnabled: false,
    embeddingEnabled: undefined,
    allowPasswordAuthentication: false,
    hasSocialLogin: false,
    isGroupManagementEnabled: false,
    isWarehouseCredentialsEnabled: false,
    isGitProject: false,
    projectSettingsAccess: 'none',
    isProjectSettingsAccessLoading: false,
    isContentReviewAvailable: false,
    isHealthLoading: false,
    healthError: null,
    isUserLoading: false,
    userError: null,
    isOrganizationLoading: false,
    organizationError: null,
    isActiveProjectUuidLoading: false,
    isProjectLoading: false,
    projectError: null,
    ...overrides,
});

const organizationNavigation = (overrides: Partial<SettingsContext> = {}) => {
    const { result } = renderHook(() =>
        useSettingsNavigation(settingsContext(overrides)),
    );
    return result.current.find((section) => section.id === 'organization')
        ?.items;
};

describe('MCP settings navigation', () => {
    it('shows Connect before General and Analytics for organization AI admins', () => {
        const items = organizationNavigation();
        const mcp = items?.find((item) => item.label === 'MCP');

        expect(mcp?.to).toBe('/generalSettings/mcp');
        expect(mcp?.children.map(({ label, to }) => ({ label, to }))).toEqual([
            { label: 'Connect', to: '/generalSettings/mcp/connect' },
            { label: 'General', to: '/generalSettings/mcp/general' },
            { label: 'Analytics', to: '/generalSettings/mcp/analytics' },
        ]);
        expect(
            items
                ?.find((item) => item.label === 'Ask AI')
                ?.children.some((item) => item.label === 'MCP'),
        ).toBe(false);
    });

    it('shows Connect and Analytics for project-scoped AI admins', () => {
        const mcp = organizationNavigation({
            canManageOrgAiAgent: false,
        })?.find((item) => item.label === 'MCP');

        expect(mcp?.children.map(({ label, to }) => ({ label, to }))).toEqual([
            { label: 'Connect', to: '/generalSettings/mcp/connect' },
            { label: 'Analytics', to: '/generalSettings/mcp/analytics' },
        ]);
    });

    it.each([
        { isAiCopilotEnabledOrTrial: false },
        { hasAnyAiAgentAccess: false },
        { canManageOrgAiAgent: false, hasAnyAiAgentAccess: false },
        {
            isAiCopilotEnabledOrTrial: false,
            canManageOrgAiAgent: false,
            hasAnyAiAgentAccess: false,
        },
    ])(
        'keeps Connect available when AI settings access is closed (%j)',
        (overrides) => {
            const mcp = organizationNavigation(overrides)?.find(
                (item) => item.label === 'MCP',
            );

            expect(
                mcp?.children.map(({ label, to }) => ({ label, to })),
            ).toEqual([
                { label: 'Connect', to: '/generalSettings/mcp/connect' },
            ]);
        },
    );

    it('indexes Client setup under Connect instead of General or Analytics', () => {
        const mcp = organizationNavigation()?.find(
            (item) => item.label === 'MCP',
        );

        expect(
            mcp?.children
                .filter((item) =>
                    item.pageSections?.some(
                        (section) => section.title === 'Client setup',
                    ),
                )
                .map(({ label, to }) => ({ label, to })),
        ).toEqual([{ label: 'Connect', to: '/generalSettings/mcp/connect' }]);
    });
});

describe('Data apps settings navigation', () => {
    const dataAppsChildren = (rules: { action: string; subject: string }[]) =>
        organizationNavigation({
            user: {
                ability: new Ability(rules),
            } as unknown as SettingsContext['user'],
            dataAppsFlag: {
                id: 'data-apps',
                enabled: true,
            } as SettingsContext['dataAppsFlag'],
        })
            ?.find((item) => item.label === 'Data apps')
            ?.children.map(({ label, to }) => ({ label, to }));

    it('shows General first to users who can manage the organization', () => {
        expect(
            dataAppsChildren([
                { action: 'manage', subject: 'Organization' },
                { action: 'manage', subject: 'OrganizationDesign' },
            ]),
        ).toEqual([
            { label: 'General', to: '/generalSettings/dataApps/general' },
            { label: 'Themes', to: '/generalSettings/dataApps/themes' },
            { label: 'Activity', to: '/generalSettings/dataApps/activity' },
        ]);
    });

    it('hides General from users who cannot manage the organization', () => {
        expect(
            dataAppsChildren([
                { action: 'manage', subject: 'OrganizationDesign' },
            ]),
        ).toEqual([
            { label: 'Themes', to: '/generalSettings/dataApps/themes' },
        ]);
    });
});

describe('AI credits settings navigation', () => {
    it('shows AI credits only to organizations that can access them', () => {
        const aiCredits = (canAccessAiCredits: boolean) =>
            organizationNavigation({ canAccessAiCredits })?.find(
                (item) => item.to === '/generalSettings/aiCredits',
            );

        expect(aiCredits(true)?.label).toBe('AI credits');
        expect(aiCredits(false)).toBeUndefined();
    });
});

describe('Agent identity navigation', () => {
    it.each([
        [WarehouseTypes.SNOWFLAKE, true, true],
        [WarehouseTypes.POSTGRES, true, false],
        [WarehouseTypes.SNOWFLAKE, false, false],
    ])(
        'gates %s with flag %s',
        (projectWarehouseType, aiPrincipalsEnabled, visible) => {
            const { result } = renderHook(() =>
                useSettingsNavigation(
                    settingsContext({
                        aiPrincipalsEnabled,
                        organization: {
                            organizationUuid: 'org',
                            name: 'Organization',
                        },
                        user: {
                            ...mockUserResponse(),
                            ability: new Ability([
                                { action: 'manage', subject: 'all' },
                            ]),
                            impersonation: null,
                        },
                        projectSettingsAccess: 'full',
                        project: {
                            warehouseConnection:
                                projectWarehouseType ===
                                WarehouseTypes.SNOWFLAKE
                                    ? {
                                          type: WarehouseTypes.SNOWFLAKE,
                                          account: 'account',
                                          database: 'db',
                                          warehouse: 'warehouse',
                                          schema: 'public',
                                      }
                                    : {
                                          type: WarehouseTypes.POSTGRES,
                                          host: 'localhost',
                                          port: 5432,
                                          dbname: 'db',
                                          schema: 'public',
                                      },
                            projectUuid: 'project',
                            organizationUuid: 'org',
                            name: 'Project',
                            type: ProjectType.DEFAULT,
                            dbtConnection: { type: DbtProjectType.NONE },
                            dbtVersion: DbtVersionOptionLatest.LATEST,
                            schedulerTimezone: 'UTC',
                            queryTimezone: null,
                            useProjectTimezoneInFilters: false,
                            schedulerFailureNotifyRecipients: false,
                            schedulerFailureIncludeContact: false,
                            schedulerFailureContactOverride: null,
                            createdByUserUuid: null,
                            hasDefaultUserSpaces: false,
                            colorPaletteUuid: null,
                            expiresAt: null,
                            agentSqlScope: null,
                        },
                    }),
                ),
            );
            expect(
                result.current
                    .flatMap((section) => section.items)
                    .some((item) => item.label === 'Agent identity'),
            ).toBe(visible);
        },
    );
});
