import { AgentConnectionGrantResourceResolver } from './AgentConnectionGrantResourceResolver';

const projectA = '11111111-1111-4111-8111-111111111111';
const projectB = '33333333-3333-4333-8333-333333333333';
const resourceUuid = '22222222-2222-4222-8222-222222222222';
const setup = () => {
    const deps = {
        deploySessionModel: {
            getSession: vi
                .fn()
                .mockResolvedValue({ projectUuid: projectA, userUuid: 'user' }),
        },
        projectModel: {
            getUuidBySlug: vi.fn().mockResolvedValue(projectA),
            getSummary: vi.fn().mockResolvedValue({ organizationUuid: 'org' }),
        },
        savedSqlModel: {
            getByUuid: vi
                .fn()
                .mockResolvedValue({ project: { projectUuid: projectB } }),
            getBySlug: vi
                .fn()
                .mockResolvedValue({ project: { projectUuid: projectA } }),
        },
        savedChartModel: {
            getSummary: vi.fn().mockResolvedValue({ projectUuid: projectB }),
            get: vi.fn().mockResolvedValue({ projectUuid: projectA }),
        },
        dashboardModel: {
            getSummaryByUuid: vi
                .fn()
                .mockResolvedValue({ projectUuid: projectB }),
            getByIdOrSlug: vi.fn().mockResolvedValue({ projectUuid: projectA }),
        },
        schedulerModel: {
            getScheduler: vi.fn().mockResolvedValue({ projectUuid: projectB }),
        },
        queryHistoryModel: {
            getByQueryUuid: vi
                .fn()
                .mockResolvedValue({ projectUuid: projectB }),
        },
    };
    const resolver = new AgentConnectionGrantResourceResolver(deps);
    return { deps, resolver };
};
it.each([
    'sql_chart',
    'saved_chart',
    'dashboard',
    'scheduler',
    'query',
] as const)(
    'resolves the actual %s project even with a decoy scope',
    async (type) => {
        const { resolver } = setup();
        expect(
            await resolver.resolveResourceProjectUuid({
                type,
                uuid: resourceUuid,
                projectUuid: projectA,
            }),
        ).toBe(projectB);
    },
);
it.each(['sql_chart', 'saved_chart', 'dashboard'] as const)(
    'resolves a scoped %s slug',
    async (type) => {
        const { resolver } = setup();
        expect(
            await resolver.resolveResourceProjectUuid({
                type,
                uuid: 'slug',
                projectUuid: projectA,
            }),
        ).toBe(projectA);
        expect(
            await resolver.resolveResourceProjectUuid({
                type,
                uuid: 'slug',
                projectUuid: null,
            }),
        ).toBeNull();
    },
);
it('resolves project slugs and validates organization ownership for UUIDs too', async () => {
    const { resolver, deps } = setup();
    expect(await resolver.resolveProjectUuid('org', 'slug')).toBe(projectA);
    expect(deps.projectModel.getUuidBySlug).toHaveBeenCalledWith('org', 'slug');
    deps.projectModel.getSummary.mockResolvedValue({
        organizationUuid: 'other',
    });
    await expect(resolver.resolveProjectUuid('org', projectA)).rejects.toThrow(
        'organization',
    );
});

it('resolves the stored deploy session project and owner', async () => {
    const { deps, resolver } = setup();
    await expect(resolver.resolveDeploySession(resourceUuid)).resolves.toEqual({
        projectUuid: projectA,
        userUuid: 'user',
    });
    expect(deps.deploySessionModel.getSession).toHaveBeenCalledExactlyOnceWith(
        resourceUuid,
    );
});
