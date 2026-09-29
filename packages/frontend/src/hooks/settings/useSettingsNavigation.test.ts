import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { type SettingsContext } from './types';
import { useSettingsNavigation } from './useSettingsNavigation';

vi.mock('../../providers/Tracking/useTracking', () => ({
    default: () => ({ track: vi.fn() }),
}));

const settingsContext = (
    overrides: Partial<SettingsContext> = {},
): SettingsContext => ({
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
    organizationChartTypesFlag: undefined,
    isDataAppsFlagLoading: false,
    externalSourcesFlag: undefined,
    isResultsCacheEnabled: false,
    embeddingEnabled: undefined,
    allowPasswordAuthentication: false,
    hasSocialLogin: false,
    isGroupManagementEnabled: false,
    isWarehouseCredentialsEnabled: false,
    isGitProject: false,
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
    const organizationChartTypesUser = (canManage: boolean) =>
        ({
            ability: {
                can: (action: string, subject: unknown) =>
                    typeof subject === 'object' &&
                    subject !== null &&
                    (subject as { __caslSubjectType__?: string })
                        .__caslSubjectType__ === 'OrganizationChartType' &&
                    action === 'manage' &&
                    canManage,
            },
        }) as unknown as SettingsContext['user'];

    const dataAppsChildren = (overrides: Partial<SettingsContext>) =>
        organizationNavigation({
            dataAppsFlag: { id: 'enable-data-apps', enabled: true },
            organization: {
                organizationUuid: 'org-1',
            } as SettingsContext['organization'],
            ...overrides,
        })
            ?.find((item) => item.label === 'Data apps')
            ?.children.map(({ label, to }) => ({ label, to })) ?? [];

    it('shows Chart types to organization chart type managers when the flag is on', () => {
        expect(
            dataAppsChildren({
                user: organizationChartTypesUser(true),
                organizationChartTypesFlag: {
                    id: 'organization-chart-types',
                    enabled: true,
                },
            }),
        ).toEqual([
            {
                label: 'Chart types',
                to: '/generalSettings/dataApps/chartTypes',
            },
        ]);
    });

    it.each([
        { canManage: true, flag: false },
        { canManage: false, flag: true },
    ])('hides Chart types (%j)', ({ canManage, flag }) => {
        expect(
            dataAppsChildren({
                user: organizationChartTypesUser(canManage),
                organizationChartTypesFlag: {
                    id: 'organization-chart-types',
                    enabled: flag,
                },
            }),
        ).toEqual([]);
    });
});
