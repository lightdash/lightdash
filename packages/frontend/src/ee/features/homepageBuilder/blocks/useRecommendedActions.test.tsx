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
            health: { data: {} },
            user: {
                data: {
                    ability: { can: () => true },
                },
            },
        } as unknown as ReturnType<typeof useApp>);
        vi.mocked(useOrganization).mockReturnValue({
            data: { needsProject: true },
        } as ReturnType<typeof useOrganization>);
        vi.mocked(useProject).mockReturnValue({
            data: undefined,
        } as ReturnType<typeof useProject>);
        vi.mocked(useProjects).mockReturnValue({
            data: [],
        } as unknown as ReturnType<typeof useProjects>);
        vi.mocked(useGithubConfig).mockReturnValue({
            data: undefined,
        } as ReturnType<typeof useGithubConfig>);
        vi.mocked(useGitlabRepositories).mockReturnValue({
            isSuccess: false,
        } as ReturnType<typeof useGitlabRepositories>);
        vi.mocked(useGetSlack).mockReturnValue({
            data: undefined,
            isSuccess: false,
        } as ReturnType<typeof useGetSlack>);
        vi.mocked(useServerFeatureFlag).mockReturnValue({
            data: undefined,
        } as ReturnType<typeof useServerFeatureFlag>);
        vi.mocked(useActiveAgentOnboardingRun).mockReturnValue({
            data: null,
        } as ReturnType<typeof useActiveAgentOnboardingRun>);
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
                ({
                    data: { enabled: flag === FeatureFlags.NewOnboarding },
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
            health: { data: { hasGithub: true } },
            user: {
                data: {
                    ability: { can: () => true },
                },
            },
        } as unknown as ReturnType<typeof useApp>);
        vi.mocked(useGithubConfig).mockReturnValue({
            data: undefined,
            isInitialLoading: true,
        } as ReturnType<typeof useGithubConfig>);

        const { result } = renderHook(() =>
            useRecommendedActions('project-uuid'),
        );

        expect(result.current.hasPendingActions).toBe(false);
    });

    it('shows no source-control annotation when nothing is connected', () => {
        vi.mocked(useApp).mockReturnValue({
            health: { data: { hasGitlab: true } },
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
                    ({
                        data: { enabled: flag === FeatureFlags.NewOnboarding },
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
            vi.mocked(useOrganization).mockReturnValue({
                data: { needsProject: false },
            } as ReturnType<typeof useOrganization>);
            vi.mocked(useProject).mockReturnValue({
                data: { provisioningSource: 'playground' },
            } as unknown as ReturnType<typeof useProject>);
            vi.mocked(useProjects).mockReturnValue({
                data: [
                    organizationProject({
                        projectUuid: 'playground-uuid',
                        provisioningSource: 'playground',
                    }),
                ],
            } as unknown as ReturnType<typeof useProjects>);
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
            vi.mocked(useProjects).mockReturnValue({
                data: [
                    organizationProject({
                        projectUuid: 'playground-uuid',
                        provisioningSource: 'playground',
                    }),
                    organizationProject({ projectUuid: 'real-uuid' }),
                ],
            } as unknown as ReturnType<typeof useProjects>);

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
                    ({
                        data: { enabled: true },
                    }) as ReturnType<typeof useServerFeatureFlag>,
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
                    ({
                        data: { enabled: true },
                    }) as ReturnType<typeof useServerFeatureFlag>,
            );
            vi.mocked(useActiveAgentOnboardingRun).mockReturnValue({
                data: {
                    agentOnboardingRunUuid: 'run-uuid',
                    projectUuid: 'project-uuid',
                },
            } as ReturnType<typeof useActiveAgentOnboardingRun>);

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
                    ({
                        data: { enabled: flag === FeatureFlags.NewOnboarding },
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
                    ({
                        data: {
                            enabled:
                                flag === FeatureFlags.CodingAgentOnboarding,
                        },
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
});
