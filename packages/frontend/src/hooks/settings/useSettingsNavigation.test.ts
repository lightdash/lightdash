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
    isDataAppsFlagLoading: false,
    isChartStudioAvailable: false,
    externalSourcesFlag: undefined,
    isResultsCacheEnabled: false,
    embeddingEnabled: undefined,
    allowPasswordAuthentication: false,
    hasSocialLogin: false,
    isGroupManagementEnabled: false,
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

describe('Agents settings navigation', () => {
    it('indexes the Identity and Permissions sections on the Agents page', () => {
        const agents = organizationNavigation({
            isAgentIdentityEnabled: true,
            user: {
                ability: new Ability([
                    { action: 'manage', subject: 'Organization' },
                ]),
            } as SettingsContext['user'],
        })?.find((item) => item.label === 'Agents');

        expect(agents?.to).toBe('/generalSettings/agentIdentity');
        expect(agents?.pageSections?.map(({ title }) => title)).toEqual([
            'Identity',
            'Permissions',
        ]);
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

describe('Themes settings navigation with Chart Studio', () => {
    const chartStudioNavigation = (
        rules: { action: string; subject: string }[],
        overrides: Partial<SettingsContext> = {},
    ) =>
        organizationNavigation({
            user: {
                ability: new Ability(rules),
            } as unknown as SettingsContext['user'],
            isChartStudioAvailable: true,
            ...overrides,
        });

    const allRules = [
        { action: 'manage', subject: 'Organization' },
        { action: 'manage', subject: 'OrganizationDesign' },
    ];

    it('shows Themes as a top-level entry without the data apps flag', () => {
        const items = chartStudioNavigation(allRules);

        expect(
            items
                ?.filter((item) => item.label === 'Themes')
                .map(({ to, children }) => ({ to, children })),
        ).toEqual([{ to: '/generalSettings/dataApps/themes', children: [] }]);
        expect(items?.some((item) => item.label === 'Data apps')).toBe(false);
        expect(
            items?.some((item) =>
                [
                    '/generalSettings/dataApps/general',
                    '/generalSettings/dataApps/activity',
                ].includes(item.to),
            ),
        ).toBe(false);
    });

    it('hides Themes from users who cannot manage designs', () => {
        expect(
            chartStudioNavigation([
                { action: 'manage', subject: 'Organization' },
            ])?.some((item) => item.label === 'Themes'),
        ).toBe(false);
    });

    it('keeps Themes inside Data apps when the flag is on', () => {
        const items = chartStudioNavigation(allRules, {
            dataAppsFlag: {
                id: 'data-apps',
                enabled: true,
            } as SettingsContext['dataAppsFlag'],
        });

        expect(items?.some((item) => item.label === 'Themes')).toBe(false);
        expect(
            items
                ?.find((item) => item.label === 'Data apps')
                ?.children.map(({ label }) => label),
        ).toEqual(['General', 'Themes', 'Activity']);
    });

    it('shows no Themes entry without Chart Studio or data apps', () => {
        expect(
            chartStudioNavigation(allRules, {
                isChartStudioAvailable: false,
            })?.some((item) => item.label === 'Themes'),
        ).toBe(false);
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

describe('managed analytics project settings navigation', () => {
    it.each(['full', 'limited'] as const)(
        'keeps only useful analytics project settings with %s access',
        (type) => {
            const { result } = renderHook(() =>
                useSettingsNavigation(
                    settingsContext({
                        organization: {
                            organizationUuid: 'org',
                            name: 'Organization',
                        },
                        project: {
                            projectUuid: 'project',
                            organizationUuid: 'org',
                            name: 'Analytics',
                            provisioningSource: 'analytics',
                        } as Project,
                        canAccessAnalyticsSettings: true,
                        health: {
                            softDelete: { enabled: true },
                            preAggregates: { enabled: false },
                        } as SettingsContext['health'],
                        user: {
                            ability: new Ability([
                                { action: 'manage', subject: 'all' },
                            ]),
                        } as SettingsContext['user'],
                        projectSettingsAccess:
                            type === 'full'
                                ? { type, defaultPage: 'settings' }
                                : {
                                      type,
                                      pages: ['recentlyDeleted'],
                                      defaultPage: 'recentlyDeleted',
                                  },
                    }),
                ),
            );
            expect(
                result.current
                    .find(({ id }) => id === 'current-project')
                    ?.items.map(({ label }) => label),
            ).toEqual(
                type === 'full'
                    ? ['Project access', 'Recently deleted']
                    : ['Recently deleted'],
            );
            expect(result.current.flatMap(({ items }) => items)).toContainEqual(
                expect.objectContaining({
                    label: 'Lightdash analytics',
                    to: '/generalSettings/lightdashAnalytics',
                }),
            );
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
                ({ label }) => label === 'My agent identity',
            );
            if (showMyAgentConnections) {
                expect(items[index - 1].label).toBe('My warehouse connections');
                expect(items[index]).toMatchObject({
                    to: '/generalSettings/myAgentConnections',
                    keywords: [
                        'agent',
                        'identity',
                        'sign-in',
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
