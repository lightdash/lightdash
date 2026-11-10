import { ParameterError, ProjectType } from '@lightdash/common';
import type { MockedFunction } from 'vitest';
import { slotFixture } from '../agentConnections/fixtures';
import { runWithAgentConnectionSelection } from '../credentials';
import { lightdashApi } from './dbt/apiClient';
import { resolveProjectFlag } from './resolveProjectFlag';

const selected = vi.hoisted(() => ({ credential: vi.fn() }));
vi.mock('../config', () => ({ getConfig: vi.fn(async () => ({})) }));
vi.mock('../credentials', async (original) => ({
    ...(await original<typeof import('../credentials')>()),
    resolveCredential: selected.credential,
}));

vi.mock('./dbt/apiClient', () => ({
    lightdashApi: vi.fn(),
}));

const mockLightdashApi = lightdashApi as MockedFunction<typeof lightdashApi>;

const PROJECT_UUID = '00000000-0000-0000-0000-000000000001';
const OTHER_UUID = '00000000-0000-0000-0000-000000000002';

const mockOrgProjects = (
    projects: { projectUuid: string; slug?: string; name: string }[],
) => {
    mockLightdashApi.mockResolvedValueOnce(
        projects.map((project) => ({
            ...project,
            type: ProjectType.DEFAULT,
        })) as never,
    );
};

describe('resolveProjectFlag', () => {
    afterEach(() => {
        vi.clearAllMocks();
    });

    it('returns a UUID as-is without calling the API', async () => {
        await expect(resolveProjectFlag(PROJECT_UUID)).resolves.toBe(
            PROJECT_UUID,
        );
        expect(mockLightdashApi).not.toHaveBeenCalled();
    });

    it('resolves a slug to the matching project UUID', async () => {
        mockOrgProjects([
            { projectUuid: OTHER_UUID, slug: 'other', name: 'Other' },
            { projectUuid: PROJECT_UUID, slug: 'jaffle-shop', name: 'Jaffle' },
        ]);

        await expect(resolveProjectFlag('jaffle-shop')).resolves.toBe(
            PROJECT_UUID,
        );
        expect(mockLightdashApi).toHaveBeenCalledWith(
            expect.objectContaining({ url: '/api/v1/org/projects' }),
        );
    });

    it('fails with an actionable error for an unknown slug', async () => {
        mockOrgProjects([
            { projectUuid: PROJECT_UUID, slug: 'jaffle-shop', name: 'Jaffle' },
            { projectUuid: OTHER_UUID, name: 'No slug' },
        ]);

        await expect(resolveProjectFlag('missing')).rejects.toThrow(
            ParameterError,
        );
    });

    it('fails when a slug matches more than one project', async () => {
        mockOrgProjects([
            { projectUuid: PROJECT_UUID, slug: 'dup', name: 'A' },
            { projectUuid: OTHER_UUID, slug: 'dup', name: 'B' },
        ]);

        await expect(resolveProjectFlag('dup')).rejects.toThrow(
            /more than one project/,
        );
    });
});

describe('selected project resolution', () => {
    beforeEach(() => {
        mockLightdashApi.mockReset();
        selected.credential.mockReset().mockResolvedValue({
            kind: 'agent_connection',
            token: 'agent',
            slot: {
                ...slotFixture(),
                lastReported: {
                    ...slotFixture().lastReported,
                    approvedProjects: [PROJECT_UUID, OTHER_UUID].map(
                        (projectUuid) => ({
                            projectUuid,
                            name: null,
                            approvedCapabilities: [],
                        }),
                    ),
                },
            },
        });
    });
    it('returns a UUID directly without organisation discovery or config reads', async () => {
        expect(
            await runWithAgentConnectionSelection('work', () =>
                resolveProjectFlag(PROJECT_UUID),
            ),
        ).toBe(PROJECT_UUID);
        expect(selected.credential).not.toHaveBeenCalled();
        expect(mockLightdashApi).not.toHaveBeenCalled();
    });
    it('resolves a slug through individual approved project reads', async () => {
        mockLightdashApi.mockImplementation(
            async ({ url }) =>
                ({
                    projectUuid: url.split('/').at(-1),
                    slug: url.endsWith(PROJECT_UUID) ? 'match' : 'other',
                }) as never,
        );
        expect(
            await runWithAgentConnectionSelection('work', () =>
                resolveProjectFlag('match'),
            ),
        ).toBe(PROJECT_UUID);
        expect(mockLightdashApi.mock.calls.map(([props]) => props.url)).toEqual(
            [
                `/api/v1/projects/${PROJECT_UUID}`,
                `/api/v1/projects/${OTHER_UUID}`,
            ],
        );
    });
    it.each(['ambiguous', 'unapproved', 'inaccessible'])(
        'refuses an %s slug without organisation discovery',
        async (mode) => {
            mockLightdashApi.mockImplementation(async ({ url }) => {
                if (mode === 'inaccessible') throw new Error('inaccessible');
                return {
                    projectUuid: url.split('/').at(-1),
                    slug: mode === 'ambiguous' ? 'match' : 'other',
                } as never;
            });
            await expect(
                runWithAgentConnectionSelection('work', () =>
                    resolveProjectFlag('match'),
                ),
            ).rejects.toThrow();
            expect(
                mockLightdashApi.mock.calls.every(
                    ([props]) => !props.url.includes('/org/'),
                ),
            ).toBe(true);
        },
    );
});
