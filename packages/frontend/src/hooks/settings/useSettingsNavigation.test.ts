import { Ability } from '@casl/ability';
import { type Project } from '@lightdash/common';
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { type LimitedProjectSettingsPage } from './projectSettingsAccess';
import { type SettingsContext } from './types';
import { useSettingsNavigation } from './useSettingsNavigation';

vi.mock('../../providers/Tracking/useTracking', () => ({
    default: () => ({ track: vi.fn() }),
}));

const settingsContext = (
    overrides: Partial<SettingsContext> = {},
): SettingsContext => ({
    showMyAgentConnections: false,
    isMyAgentConnectionsLoading: false,
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
    isDataAppGeneralSettingsEnabled: false,
    isDataAppsFlagLoading: false,
    externalSourcesFlag: undefined,
    isResultsCacheEnabled: false,
    embeddingEnabled: undefined,
    allowPasswordAuthentication: false,
    hasSocialLogin: false,
    isGroupManagementEnabled: false,
    isWarehouseCredentialsEnabled: false,
    isAgentIdentityEnabled: false,
    isAgentIdentityFlagLoading: false,
    isGitProject: false,
    projectSettingsAccess: { type: 'none', defaultPage: null },
    isProjectSettingsAccessLoading: false,
    projectSettingsAccessError: null,
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
    const dataAppsChildren = (
        rules: { action: string; subject: string }[],
        { generalEnabled = true }: { generalEnabled?: boolean } = {},
    ) =>
        organizationNavigation({
            user: {
                ability: new Ability(rules),
            } as unknown as SettingsContext['user'],
            dataAppsFlag: {
                id: 'data-apps',
                enabled: true,
            } as SettingsContext['dataAppsFlag'],
            isDataAppGeneralSettingsEnabled: generalEnabled,
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

    it('hides General when its only setting is behind an off flag', () => {
        expect(
            dataAppsChildren(
                [
                    { action: 'manage', subject: 'Organization' },
                    { action: 'manage', subject: 'OrganizationDesign' },
                ],
                { generalEnabled: false },
            ),
        ).toEqual([
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

describe('limited project settings navigation', () => {
    it.each([
        {
            pages: ['recentlyDeleted'] as LimitedProjectSettingsPage[],
            expected: [
                {
                    label: 'Recently deleted',
                    to: '/generalSettings/projectManagement/project/recentlyDeleted',
                },
            ],
        },
        {
            pages: [
                'validator',
                'recentlyDeleted',
            ] as LimitedProjectSettingsPage[],
            expected: [
                {
                    label: 'Validator',
                    to: '/generalSettings/projectManagement/project/validator',
                },
                {
                    label: 'Recently deleted',
                    to: '/generalSettings/projectManagement/project/recentlyDeleted',
                },
            ],
        },
    ])(
        'lists only the allowed project settings pages ($pages)',
        ({ pages, expected }) => {
            const { result } = renderHook(() =>
                useSettingsNavigation(
                    settingsContext({
                        organization: {
                            organizationUuid: 'org',
                            name: 'Test organization',
                        },
                        project: {
                            organizationUuid: 'org',
                            projectUuid: 'project',
                            name: 'Test project',
                        } as Project,
                        projectSettingsAccess: {
                            type: 'limited',
                            pages,
                            defaultPage: pages[0],
                        },
                    }),
                ),
            );
            expect(
                result.current
                    .find((section) => section.id === 'current-project')
                    ?.items.map(({ label, to }) => ({ label, to })),
            ).toEqual(expected);
        },
    );
});

describe('Agent identity settings navigation', () => {
    it.each([
        [true, 'manage', true],
        [false, 'manage', false],
        [true, 'update', false],
        [true, 'view', false],
    ])('flag %s with %s project permission', (enabled, action, visible) => {
        const { result } = renderHook(() =>
            useSettingsNavigation(
                settingsContext({
                    isAgentIdentityEnabled: enabled,
                    organization: {
                        organizationUuid: 'org',
                        name: 'Organization',
                    },
                    project: {
                        projectUuid: 'project',
                        organizationUuid: 'org',
                        name: 'Project',
                    } as Project,
                    user: {
                        ability: new Ability([
                            {
                                action,
                                subject: 'Project',
                                conditions: {
                                    organizationUuid: 'org',
                                    projectUuid: 'project',
                                },
                            },
                        ]),
                    } as SettingsContext['user'],
                    projectSettingsAccess: {
                        type: 'full',
                        defaultPage: 'settings',
                    },
                }),
            ),
        );
        const items = result.current.find(
            ({ id }) => id === 'current-project',
        )!.items;
        const index = items.findIndex(
            ({ label }) => label === 'Agent identity',
        );
        if (visible) {
            expect(items[index].to).toBe(
                '/generalSettings/projectManagement/project/agentIdentity',
            );
            expect(items[index - 1].label).toBe('Tables configuration');
        } else expect(index).toBe(-1);
    });
});

describe('My agent connections navigation', () => {
    it.each([true, false])(
        'uses shared visibility %s',
        (showMyAgentConnections) => {
            const { result } = renderHook(() =>
                useSettingsNavigation(
                    settingsContext({ showMyAgentConnections }),
                ),
            );
            const items = result.current.find(
                ({ id }) => id === 'your-settings',
            )!.items;
            const index = items.findIndex(
                ({ label }) => label === 'My agent connections',
            );
            if (showMyAgentConnections) {
                expect(items[index - 1].label).toBe('My warehouse connections');
                expect(items[index]).toMatchObject({
                    to: '/generalSettings/myAgentConnections',
                    keywords: [
                        'agent',
                        'ai',
                        'mcp',
                        'snowflake',
                        'bigquery',
                        'connect',
                    ],
                });
            } else {
                expect(index).toBe(-1);
            }
        },
    );
});
