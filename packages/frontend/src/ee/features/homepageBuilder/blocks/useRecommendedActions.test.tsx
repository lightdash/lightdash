import {
    DbtProjectType,
    DbtProjectTypeLabels,
    FeatureFlags,
    ProjectType,
    type HomepageRecommendedActionKey,
    type OrganizationProject,
} from '@lightdash/common';
import { renderHook } from '@testing-library/react';
import { useGithubConfig } from '../../../../components/common/GithubIntegration/hooks/useGithubIntegration';
import { useGitlabRepositories } from '../../../../components/common/GitlabIntegration/hooks/useGitlabIntegration';
import { useOrganization } from '../../../../hooks/organization/useOrganization';
import { useGetSlack } from '../../../../hooks/slack/useSlack';
import { useProject } from '../../../../hooks/useProject';
import { useProjects } from '../../../../hooks/useProjects';
import { useServerFeatureFlag } from '../../../../hooks/useServerOrClientFeatureFlag';
import useApp from '../../../../providers/App/useApp';
import { useActiveAgentOnboardingRun } from '../../agentOnboarding/hooks/useAgentOnboarding';
import { useHomepageRecommendedActionSkips } from '../hooks/useHomepageRecommendedActionSkips';
import { useRecommendedActions } from './useRecommendedActions';

vi.mock(
    '../../../../components/common/GithubIntegration/hooks/useGithubIntegration',
);
vi.mock(
    '../../../../components/common/GitlabIntegration/hooks/useGitlabIntegration',
);
vi.mock('../../../../hooks/organization/useOrganization');
vi.mock('../../../../hooks/slack/useSlack');
vi.mock('../../../../hooks/useProject');
vi.mock('../../../../hooks/useProjects');
vi.mock('../../../../providers/App/useApp');
vi.mock('../../../../hooks/useServerOrClientFeatureFlag');
vi.mock('../../agentOnboarding/hooks/useAgentOnboarding');
vi.mock('../hooks/useHomepageRecommendedActionSkips');

// The hook reads settledness, not just "is a request in flight", so every
// mocked query has to say whether it has come back — an unfetched query is
// still pending even when nothing is loading it.
const settled = <T,>(data: T) => ({
    data,
    isFetched: true,
    isInitialLoading: false,
    isSuccess: true,
});

const unfetched = {
    data: undefined,
    isFetched: false,
    isInitialLoading: false,
    isSuccess: false,
};

const loading = {
    data: undefined,
    isFetched: false,
    isInitialLoading: true,
    isSuccess: false,
};

const recommendedActionSkipsResult = (
    overrides: Partial<
        ReturnType<typeof useHomepageRecommendedActionSkips>
    > = {},
): ReturnType<typeof useHomepageRecommendedActionSkips> => ({
    skippedActions: [],
    isLoading: false,
    skipAction: vi.fn(),
    restoreAction: vi.fn(),
    ...overrides,
});

const organizationProject = (
    overrides: Partial<OrganizationProject>,
): OrganizationProject => ({
    projectUuid: 'project-uuid',
    name: 'Project',
    type: ProjectType.DEFAULT,
    createdByUserUuid: null,
    createdByUserName: null,
    createdAt: new Date(0),
    upstreamProjectUuid: null,
    expiresAt: null,
    ...overrides,
});

describe('useRecommendedActions', () => {
    beforeEach(() => {
        vi.mocked(useApp).mockReturnValue({
            health: settled({}),
            user: {
                data: {
                    ability: { can: () => true },
                },
            },
        } as unknown as ReturnType<typeof useApp>);
        vi.mocked(useOrganization).mockReturnValue(
            settled({ needsProject: true }) as ReturnType<
                typeof useOrganization
            >,
        );
        vi.mocked(useProject).mockReturnValue(
            settled(undefined) as ReturnType<typeof useProject>,
        );
        vi.mocked(useProjects).mockReturnValue(
            settled([]) as unknown as ReturnType<typeof useProjects>,
        );
        vi.mocked(useGithubConfig).mockReturnValue(
            settled(undefined) as ReturnType<typeof useGithubConfig>,
        );
        vi.mocked(useGitlabRepositories).mockReturnValue({
            ...settled(undefined),
            isSuccess: false,
        } as unknown as ReturnType<typeof useGitlabRepositories>);
        vi.mocked(useGetSlack).mockReturnValue({
            ...settled(undefined),
            isSuccess: false,
        } as unknown as ReturnType<typeof useGetSlack>);
        vi.mocked(useServerFeatureFlag).mockReturnValue(
            settled(undefined) as ReturnType<typeof useServerFeatureFlag>,
        );
        vi.mocked(useActiveAgentOnboardingRun).mockReturnValue(
            settled(null) as ReturnType<typeof useActiveAgentOnboardingRun>,
        );
        vi.mocked(useHomepageRecommendedActionSkips).mockReturnValue(
            recommendedActionSkipsResult(),
        );
    });

    it('reads skipped actions from the server query for each project context', () => {
        vi.mocked(useHomepageRecommendedActionSkips).mockImplementation(
            (projectUuid) =>
                recommendedActionSkipsResult({
                    skippedActions: [
                        projectUuid === null
                            ? 'connect-slack'
                            : 'add-semantic-layer',
                    ] satisfies HomepageRecommendedActionKey[],
                }),
        );

        const { result, rerender } = renderHook(
            ({ projectUuid }: { projectUuid: string | null }) =>
                useRecommendedActions(projectUuid),
            { initialProps: { projectUuid: null as string | null } },
        );

        expect(result.current.skippedActions).toEqual(['connect-slack']);

        rerender({ projectUuid: 'project-uuid' });

        expect(result.current.skippedActions).toEqual(['add-semantic-layer']);
        expect(useHomepageRecommendedActionSkips).toHaveBeenLastCalledWith(
            'project-uuid',
            { enabled: true },
        );
    });

    it('does not report pending actions while skipped actions are loading', () => {
        vi.mocked(useServerFeatureFlag).mockImplementation(
            (flag) =>
                settled({
                    enabled: flag === FeatureFlags.NewOnboarding,
                }) as ReturnType<typeof useServerFeatureFlag>,
        );
        vi.mocked(useHomepageRecommendedActionSkips).mockReturnValue(
            recommendedActionSkipsResult({ isLoading: true }),
        );

        const { result } = renderHook(() =>
            useRecommendedActions('project-uuid'),
        );

        expect(result.current.hasPendingActions).toBe(false);
    });

    it('reports no pending actions while source control is still loading', () => {
        vi.mocked(useApp).mockReturnValue({
            health: settled({ hasGithub: true }),
            user: {
                data: {
                    ability: { can: () => true },
                },
            },
        } as unknown as ReturnType<typeof useApp>);
        vi.mocked(useGithubConfig).mockReturnValue(
            loading as ReturnType<typeof useGithubConfig>,
        );

        const { result } = renderHook(() =>
            useRecommendedActions('project-uuid'),
        );

        expect(result.current.hasPendingActions).toBe(false);
    });

    it('shows no source-control annotation when nothing is connected', () => {
        vi.mocked(useApp).mockReturnValue({
            health: settled({ hasGitlab: true }),
            user: {
                data: {
                    ability: { can: () => true },
                },
            },
        } as unknown as ReturnType<typeof useApp>);

        const { result } = renderHook(() =>
            useRecommendedActions('project-uuid'),
        );

        expect(
            result.current.statuses['connect-source-control'].isVisible,
        ).toBe(true);
        expect(
            result.current.statuses['connect-source-control'].isComplete,
        ).toBe(false);
        expect(
            result.current.statuses['connect-source-control'].annotation,
        ).toBeNull();
    });

    it('completes the dbt step from a dbt connection when no repo is linked', () => {
        vi.mocked(useApp).mockReturnValue({
            health: { data: { hasGithub: true } },
            user: {
                data: {
                    ability: { can: () => true },
                },
            },
        } as unknown as ReturnType<typeof useApp>);
        vi.mocked(useProject).mockReturnValue({
            data: { dbtConnection: { type: DbtProjectType.DBT_CLOUD_IDE } },
        } as unknown as ReturnType<typeof useProject>);

        const { result } = renderHook(() =>
            useRecommendedActions('project-uuid'),
        );

        expect(
            result.current.statuses['connect-source-control'].isComplete,
        ).toBe(true);
        expect(
            result.current.statuses['connect-source-control'].annotation,
        ).toBe(DbtProjectTypeLabels[DbtProjectType.DBT_CLOUD_IDE]);
    });

    it('leaves the dbt step incomplete for a NONE dbt connection', () => {
        vi.mocked(useApp).mockReturnValue({
            health: { data: { hasGithub: true } },
            user: {
                data: {
                    ability: { can: () => true },
                },
            },
        } as unknown as ReturnType<typeof useApp>);
        vi.mocked(useProject).mockReturnValue({
            data: { dbtConnection: { type: DbtProjectType.NONE } },
        } as unknown as ReturnType<typeof useProject>);

        const { result } = renderHook(() =>
            useRecommendedActions('project-uuid'),
        );

        expect(
            result.current.statuses['connect-source-control'].isComplete,
        ).toBe(false);
    });

    describe('new-onboarding gate', () => {
        it('has no pending actions while new-onboarding is disabled', () => {
            const { result } = renderHook(() =>
                useRecommendedActions('project-uuid'),
            );

            expect(result.current.visibleActions).toContain(
                'connect-warehouse',
            );
            expect(result.current.hasPendingActions).toBe(false);
        });

        it('has pending actions once new-onboarding is enabled', () => {
            vi.mocked(useServerFeatureFlag).mockImplementation(
                (flag) =>
                    settled({
                        enabled: flag === FeatureFlags.NewOnboarding,
                    }) as ReturnType<typeof useServerFeatureFlag>,
            );

            const { result } = renderHook(() =>
                useRecommendedActions('project-uuid'),
            );

            expect(result.current.hasPendingActions).toBe(true);
        });
    });

    describe('on a playground project', () => {
        beforeEach(() => {
            vi.mocked(useOrganization).mockReturnValue(
                settled({ needsProject: false }) as ReturnType<
                    typeof useOrganization
                >,
            );
            vi.mocked(useProject).mockReturnValue(
                settled({
                    provisioningSource: 'playground',
                }) as unknown as ReturnType<typeof useProject>,
            );
            vi.mocked(useProjects).mockReturnValue(
                settled([
                    organizationProject({
                        projectUuid: 'playground-uuid',
                        provisioningSource: 'playground',
                    }),
                ]) as unknown as ReturnType<typeof useProjects>,
            );
        });

        it('offers no actions so the setup checklist stays hidden', () => {
            const { result } = renderHook(() =>
                useRecommendedActions('playground-uuid'),
            );

            expect(result.current.visibleActions).toEqual([]);
            expect(result.current.hasPendingActions).toBe(false);
        });

        it('does not count the playground as a connected warehouse', () => {
            const { result } = renderHook(() =>
                useRecommendedActions('playground-uuid'),
            );

            expect(
                result.current.statuses['connect-warehouse'].isComplete,
            ).toBe(false);
        });

        it('completes connect-warehouse once a real project exists', () => {
            vi.mocked(useProjects).mockReturnValue(
                settled([
                    organizationProject({
                        projectUuid: 'playground-uuid',
                        provisioningSource: 'playground',
                    }),
                    organizationProject({ projectUuid: 'real-uuid' }),
                ]) as unknown as ReturnType<typeof useProjects>,
            );

            const { result } = renderHook(() =>
                useRecommendedActions('playground-uuid'),
            );

            expect(
                result.current.statuses['connect-warehouse'].isComplete,
            ).toBe(true);
        });
    });

    describe('add-semantic-layer destination', () => {
        it('links to the current project agent setup flow when both flags are enabled', () => {
            vi.mocked(useServerFeatureFlag).mockImplementation(
                () =>
                    settled({ enabled: true }) as ReturnType<
                        typeof useServerFeatureFlag
                    >,
            );

            const { result } = renderHook(() =>
                useRecommendedActions('project-uuid'),
            );

            expect(
                result.current.statuses['add-semantic-layer'].url,
            ).toStrictEqual('/projects/project-uuid/onboarding/agent');
            expect(
                result.current.statuses['add-semantic-layer'].ctaLabel,
            ).toStrictEqual('Set up');
        });

        it('resumes an in-flight agent run instead of restarting the flow', () => {
            vi.mocked(useServerFeatureFlag).mockImplementation(
                () =>
                    settled({ enabled: true }) as ReturnType<
                        typeof useServerFeatureFlag
                    >,
            );
            vi.mocked(useActiveAgentOnboardingRun).mockReturnValue(
                settled({
                    agentOnboardingRunUuid: 'run-uuid',
                    projectUuid: 'project-uuid',
                }) as ReturnType<typeof useActiveAgentOnboardingRun>,
            );

            const { result } = renderHook(() =>
                useRecommendedActions('project-uuid'),
            );

            expect(
                result.current.statuses['add-semantic-layer'].url,
            ).toStrictEqual('/projects/project-uuid/onboarding/runs/run-uuid');
            expect(
                result.current.statuses['add-semantic-layer'].ctaLabel,
            ).toStrictEqual('Resume');
        });

        it('keeps the settings link when coding-agent onboarding is disabled', () => {
            vi.mocked(useServerFeatureFlag).mockImplementation(
                (flag) =>
                    settled({
                        enabled: flag === FeatureFlags.NewOnboarding,
                    }) as ReturnType<typeof useServerFeatureFlag>,
            );

            const { result } = renderHook(() =>
                useRecommendedActions('project-uuid'),
            );

            expect(
                result.current.statuses['add-semantic-layer'].url,
            ).toStrictEqual(
                '/generalSettings/projectManagement/project-uuid/settings',
            );
        });

        it('keeps the settings link when new-onboarding is disabled', () => {
            vi.mocked(useServerFeatureFlag).mockImplementation(
                (flag) =>
                    settled({
                        enabled: flag === FeatureFlags.CodingAgentOnboarding,
                    }) as ReturnType<typeof useServerFeatureFlag>,
            );

            const { result } = renderHook(() =>
                useRecommendedActions('project-uuid'),
            );

            expect(
                result.current.statuses['add-semantic-layer'].url,
            ).toStrictEqual(
                '/generalSettings/projectManagement/project-uuid/settings',
            );
        });
    });

    describe('readiness through the query cascade', () => {
        // Health decides which integrations are in play and the feature flags
        // decide whether the agent run is looked up, so those queries do not
        // start on the first render — they sit idle, reporting exactly what a
        // finished query reports. These stages walk that real sequence.
        const healthInFlight = () => {
            vi.mocked(useApp).mockReturnValue({
                health: loading,
                user: { data: { ability: { can: () => true } } },
            } as unknown as ReturnType<typeof useApp>);
            vi.mocked(useOrganization).mockReturnValue(
                loading as ReturnType<typeof useOrganization>,
            );
            vi.mocked(useProject).mockReturnValue(
                loading as ReturnType<typeof useProject>,
            );
            vi.mocked(useProjects).mockReturnValue(
                loading as unknown as ReturnType<typeof useProjects>,
            );
            vi.mocked(useGithubConfig).mockReturnValue(
                loading as ReturnType<typeof useGithubConfig>,
            );
            vi.mocked(useGetSlack).mockReturnValue(
                loading as unknown as ReturnType<typeof useGetSlack>,
            );
            vi.mocked(useServerFeatureFlag).mockReturnValue(
                loading as ReturnType<typeof useServerFeatureFlag>,
            );
            // Gated on health, so not started: idle, not loading
            vi.mocked(useGitlabRepositories).mockReturnValue(
                unfetched as unknown as ReturnType<
                    typeof useGitlabRepositories
                >,
            );
            // Gated on the flags, so not started either
            vi.mocked(useActiveAgentOnboardingRun).mockReturnValue(
                unfetched as ReturnType<typeof useActiveAgentOnboardingRun>,
            );
        };

        const healthResolvedDependentsUnstarted = () => {
            vi.mocked(useApp).mockReturnValue({
                health: settled({
                    hasGithub: true,
                    hasGitlab: true,
                    hasSlack: true,
                }),
                user: { data: { ability: { can: () => true } } },
            } as unknown as ReturnType<typeof useApp>);
            vi.mocked(useOrganization).mockReturnValue(
                settled({ needsProject: true }) as ReturnType<
                    typeof useOrganization
                >,
            );
            vi.mocked(useProject).mockReturnValue(
                settled(undefined) as ReturnType<typeof useProject>,
            );
            vi.mocked(useProjects).mockReturnValue(
                settled([]) as unknown as ReturnType<typeof useProjects>,
            );
        };

        const flagsResolved = () => {
            vi.mocked(useServerFeatureFlag).mockReturnValue(
                settled({ enabled: true }) as ReturnType<
                    typeof useServerFeatureFlag
                >,
            );
        };

        const integrationsResolved = () => {
            vi.mocked(useGithubConfig).mockReturnValue(
                settled(undefined) as ReturnType<typeof useGithubConfig>,
            );
            vi.mocked(useGitlabRepositories).mockReturnValue({
                ...settled(undefined),
                isSuccess: false,
            } as unknown as ReturnType<typeof useGitlabRepositories>);
            vi.mocked(useGetSlack).mockReturnValue({
                ...settled(undefined),
                isSuccess: false,
            } as unknown as ReturnType<typeof useGetSlack>);
        };

        const flagsResolvedAgentRunUnstarted = () => {
            flagsResolved();
            integrationsResolved();
        };

        // The flags opened its gate, so it is now genuinely in flight
        const agentRunInFlight = () => {
            vi.mocked(useActiveAgentOnboardingRun).mockReturnValue(
                loading as ReturnType<typeof useActiveAgentOnboardingRun>,
            );
        };

        const allSettled = () => {
            vi.mocked(useActiveAgentOnboardingRun).mockReturnValue(
                settled(null) as ReturnType<typeof useActiveAgentOnboardingRun>,
            );
        };

        const recordCascade = (stages: (() => void)[]) => {
            stages[0]();
            const { result, rerender } = renderHook(() =>
                useRecommendedActions('project-uuid'),
            );
            const seen = [result.current.isLoading];
            stages.slice(1).forEach((stage) => {
                stage();
                rerender();
                seen.push(result.current.isLoading);
            });
            return seen;
        };

        it('stays loading until every dependent query has started and come back', () => {
            expect(
                recordCascade([
                    healthInFlight,
                    healthResolvedDependentsUnstarted,
                    flagsResolvedAgentRunUnstarted,
                    allSettled,
                ]),
            ).toEqual([true, true, true, false]);
        });

        it('never returns to loading once it has reported ready', () => {
            const seen = recordCascade([
                healthInFlight,
                healthResolvedDependentsUnstarted,
                flagsResolvedAgentRunUnstarted,
                // The moment that used to flip readiness back off: the flags
                // land, the agent-run query they gate finally starts, and the
                // heading it feeds regresses to a skeleton
                agentRunInFlight,
                allSettled,
            ]);

            const regressions = seen.filter(
                (isLoading, index) =>
                    index > 0 && isLoading && !seen[index - 1],
            );
            expect(regressions).toEqual([]);
        });

        it('rules out an integration health says the instance does not have', () => {
            const seen = recordCascade([
                healthInFlight,
                () => {
                    healthResolvedDependentsUnstarted();
                    vi.mocked(useApp).mockReturnValue({
                        health: settled({}),
                        user: { data: { ability: { can: () => true } } },
                    } as unknown as ReturnType<typeof useApp>);
                },
                flagsResolved,
                allSettled,
            ]);

            // GitHub, GitLab and Slack are off on this instance, so their
            // queries stay unresolved for the whole run and still hold nothing
            // up — the flag-gated agent run is the only remaining term
            expect(seen).toEqual([true, true, true, false]);
        });
    });
});
