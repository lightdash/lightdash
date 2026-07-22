import {
    FeatureFlags,
    ProjectType,
    type OrganizationProject,
} from '@lightdash/common';
import { renderHook, waitFor } from '@testing-library/react';
import { useGithubConfig } from '../../../../components/common/GithubIntegration/hooks/useGithubIntegration';
import { useGitlabRepositories } from '../../../../components/common/GitlabIntegration/hooks/useGitlabIntegration';
import { useOrganization } from '../../../../hooks/organization/useOrganization';
import { useGetSlack } from '../../../../hooks/slack/useSlack';
import { useProject } from '../../../../hooks/useProject';
import { useProjects } from '../../../../hooks/useProjects';
import { useServerFeatureFlag } from '../../../../hooks/useServerOrClientFeatureFlag';
import useApp from '../../../../providers/App/useApp';
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
        localStorage.clear();
    });

    it('reloads skipped actions when the project changes', async () => {
        localStorage.setItem(
            'lightdash:recommended-actions:skipped:no-project',
            JSON.stringify(['connect-slack']),
        );
        localStorage.setItem(
            'lightdash:recommended-actions:skipped:project-uuid',
            JSON.stringify(['add-semantic-layer']),
        );

        const { result, rerender } = renderHook(
            ({ projectUuid }: { projectUuid: string | null }) =>
                useRecommendedActions(projectUuid),
            { initialProps: { projectUuid: null as string | null } },
        );

        expect(result.current.skippedActions).toEqual(['connect-slack']);

        rerender({ projectUuid: 'project-uuid' });

        await waitFor(() => {
            expect(result.current.skippedActions).toEqual([
                'add-semantic-layer',
            ]);
        });
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

        it('keeps connect-warehouse as the only visible action', () => {
            const { result } = renderHook(() =>
                useRecommendedActions('playground-uuid'),
            );

            expect(result.current.visibleActions).toEqual([
                'connect-warehouse',
            ]);
        });

        it('does not count the playground as a connected warehouse', () => {
            const { result } = renderHook(() =>
                useRecommendedActions('playground-uuid'),
            );

            expect(
                result.current.statuses['connect-warehouse'].isComplete,
            ).toBe(false);
            expect(result.current.hasPendingActions).toBe(true);
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
