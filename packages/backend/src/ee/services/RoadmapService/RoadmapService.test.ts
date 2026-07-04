import { RoadmapItemStatus } from '@lightdash/common';
import type { Mocked } from 'vitest';
import { lightdashConfigMock } from '../../../config/lightdashConfig.mock';
import type { LightdashConfig } from '../../../config/parseConfig';
import type { LinearClient } from '../../clients/Linear/LinearClient';
import type { RoadmapModel } from '../../models/RoadmapModel';
import { RoadmapService } from './RoadmapService';

const organizationUuid = '11111111-1111-1111-1111-111111111111';

const enabledConfig: LightdashConfig = {
    ...lightdashConfigMock,
    roadmap: {
        ...lightdashConfigMock.roadmap,
        enabled: true,
    },
};

const createLinearClient = (): Mocked<
    Pick<LinearClient, 'listCustomers' | 'getCustomerFeatureRequests'>
> => ({
    listCustomers: vi.fn(),
    getCustomerFeatureRequests: vi.fn(),
});

const createRoadmapModel = (): Mocked<
    Pick<
        RoadmapModel,
        | 'replaceCustomerMirror'
        | 'findCustomerLinkForOrg'
        | 'getRoadmapItemsForOrg'
    >
> => ({
    replaceCustomerMirror: vi.fn(),
    findCustomerLinkForOrg: vi.fn(),
    getRoadmapItemsForOrg: vi.fn(),
});

const buildService = (
    roadmapModel: ReturnType<typeof createRoadmapModel>,
    linearClient: ReturnType<typeof createLinearClient> | null,
    config: LightdashConfig = enabledConfig,
) =>
    new RoadmapService({
        lightdashConfig: config,
        roadmapModel: roadmapModel as unknown as RoadmapModel,
        linearClient: linearClient as unknown as LinearClient | null,
    });

describe('RoadmapService', () => {
    describe('syncMirror', () => {
        it('does nothing when the feature is disabled', async () => {
            const roadmapModel = createRoadmapModel();
            const linearClient = createLinearClient();
            const service = buildService(roadmapModel, linearClient, {
                ...enabledConfig,
                roadmap: { ...enabledConfig.roadmap, enabled: false },
            });

            const summary = await service.syncMirror();

            expect(summary).toEqual({
                customers: 0,
                skippedCustomers: 0,
                syncedItems: 0,
                rejectedItems: 0,
                nonPublicItems: 0,
            });
            expect(linearClient.listCustomers).not.toHaveBeenCalled();
            expect(roadmapModel.replaceCustomerMirror).not.toHaveBeenCalled();
        });

        it('does nothing when there is no Linear client', async () => {
            const roadmapModel = createRoadmapModel();
            const service = buildService(roadmapModel, null);

            const summary = await service.syncMirror();

            expect(summary.customers).toBe(0);
            expect(roadmapModel.replaceCustomerMirror).not.toHaveBeenCalled();
        });

        it('curates mappable issues and stores them per resolved org', async () => {
            const roadmapModel = createRoadmapModel();
            const linearClient = createLinearClient();
            linearClient.listCustomers.mockResolvedValue([
                {
                    id: 'cust-1',
                    name: 'Acme',
                    externalIds: [organizationUuid],
                },
            ]);
            linearClient.getCustomerFeatureRequests.mockResolvedValue([
                {
                    id: 'issue-1',
                    title: 'Dark mode',
                    description: 'Please',
                    state: { name: 'In Progress', type: 'started' },
                    issueUrl: 'https://github.com/lightdash/lightdash/issues/1',
                    pullRequestUrl: null,
                },
                {
                    id: 'issue-2',
                    title: 'Unmappable',
                    description: null,
                    state: { name: 'Mystery', type: 'mystery' },
                    issueUrl: 'https://github.com/lightdash/lightdash/issues/2',
                    pullRequestUrl: null,
                },
                // Internal Linear task — no public GitHub issue, never mirrored.
                {
                    id: 'issue-3',
                    title: 'Set up SSO for a customer',
                    description: 'internal admin task',
                    state: { name: 'In Progress', type: 'started' },
                    issueUrl: null,
                    pullRequestUrl: null,
                },
            ]);

            const service = buildService(roadmapModel, linearClient);
            const summary = await service.syncMirror();

            expect(summary).toEqual({
                customers: 1,
                skippedCustomers: 0,
                syncedItems: 1,
                rejectedItems: 1,
                nonPublicItems: 1,
            });
            expect(roadmapModel.replaceCustomerMirror).toHaveBeenCalledWith({
                organizationUuid,
                linearCustomerId: 'cust-1',
                linearCustomerName: 'Acme',
                items: [
                    {
                        linearIssueId: 'issue-1',
                        title: 'Dark mode',
                        description: 'Please',
                        status: RoadmapItemStatus.BUILDING,
                        issueUrl:
                            'https://github.com/lightdash/lightdash/issues/1',
                        pullRequestUrl: null,
                    },
                ],
            });
        });

        it('mirrors an issue once when multiple needs reference it', async () => {
            const roadmapModel = createRoadmapModel();
            const linearClient = createLinearClient();
            linearClient.listCustomers.mockResolvedValue([
                {
                    id: 'cust-1',
                    name: 'Acme',
                    externalIds: [organizationUuid],
                },
            ]);
            const issue = {
                id: 'issue-1',
                title: 'Dark mode',
                description: null,
                state: { name: 'In Progress', type: 'started' },
                issueUrl: 'https://github.com/lightdash/lightdash/issues/1',
                pullRequestUrl: null,
            };
            linearClient.getCustomerFeatureRequests.mockResolvedValue([
                issue,
                issue,
            ]);

            const service = buildService(roadmapModel, linearClient);
            const summary = await service.syncMirror();

            expect(summary.syncedItems).toBe(1);
            expect(
                roadmapModel.replaceCustomerMirror.mock.calls[0][0].items,
            ).toHaveLength(1);
        });

        it('resolves a lightdash-prefixed external id among other ids', async () => {
            const roadmapModel = createRoadmapModel();
            const linearClient = createLinearClient();
            linearClient.listCustomers.mockResolvedValue([
                {
                    id: 'cust-1',
                    name: 'Acme',
                    externalIds: [
                        'attio-record-id',
                        `lightdash:${organizationUuid}`,
                    ],
                },
            ]);
            linearClient.getCustomerFeatureRequests.mockResolvedValue([]);

            const service = buildService(roadmapModel, linearClient);
            const summary = await service.syncMirror();

            expect(summary.skippedCustomers).toBe(0);
            expect(roadmapModel.replaceCustomerMirror).toHaveBeenCalledWith(
                expect.objectContaining({ organizationUuid }),
            );
        });

        it('skips customers with more than one lightdash-prefixed id', async () => {
            const roadmapModel = createRoadmapModel();
            const linearClient = createLinearClient();
            linearClient.listCustomers.mockResolvedValue([
                {
                    id: 'cust-1',
                    name: 'Acme',
                    externalIds: [
                        `lightdash:${organizationUuid}`,
                        'lightdash:22222222-2222-2222-2222-222222222222',
                    ],
                },
            ]);

            const service = buildService(roadmapModel, linearClient);
            const summary = await service.syncMirror();

            expect(summary.skippedCustomers).toBe(1);
            expect(roadmapModel.replaceCustomerMirror).not.toHaveBeenCalled();
        });

        it('skips customers that do not resolve to exactly one org', async () => {
            const roadmapModel = createRoadmapModel();
            const linearClient = createLinearClient();
            linearClient.listCustomers.mockResolvedValue([
                { id: 'cust-none', name: 'No ids', externalIds: [] },
                {
                    id: 'cust-many',
                    name: 'Ambiguous',
                    externalIds: ['a', 'b'],
                },
            ]);

            const service = buildService(roadmapModel, linearClient);
            const summary = await service.syncMirror();

            expect(summary.skippedCustomers).toBe(2);
            expect(
                linearClient.getCustomerFeatureRequests,
            ).not.toHaveBeenCalled();
            expect(roadmapModel.replaceCustomerMirror).not.toHaveBeenCalled();
        });
    });

    describe('getRoadmapForOrg', () => {
        it('returns mapped:false when the org has no mapped customer', async () => {
            const roadmapModel = createRoadmapModel();
            roadmapModel.findCustomerLinkForOrg.mockResolvedValue(null);
            const service = buildService(roadmapModel, createLinearClient());

            const result = await service.getRoadmapForOrg({ organizationUuid });

            expect(result).toEqual({ mapped: false, items: [] });
            expect(roadmapModel.getRoadmapItemsForOrg).not.toHaveBeenCalled();
        });

        it('returns redacted items from the store', async () => {
            const roadmapModel = createRoadmapModel();
            roadmapModel.findCustomerLinkForOrg.mockResolvedValue({
                organizationUuid,
                linearCustomerId: 'cust-1',
                linearCustomerName: 'Acme',
                syncedAt: new Date(),
            });
            roadmapModel.getRoadmapItemsForOrg.mockResolvedValue([
                {
                    title: 'Dark mode',
                    description: 'Please',
                    status: RoadmapItemStatus.BUILDING,
                    issueUrl: null,
                    pullRequestUrl: null,
                },
            ]);
            const service = buildService(roadmapModel, createLinearClient());

            const result = await service.getRoadmapForOrg({ organizationUuid });

            expect(result).toEqual({
                mapped: true,
                items: [
                    {
                        title: 'Dark mode',
                        description: 'Please',
                        status: RoadmapItemStatus.BUILDING,
                        issueUrl: null,
                        pullRequestUrl: null,
                    },
                ],
            });
        });

        it('excludes stored items that fail the redaction checkpoint', async () => {
            const roadmapModel = createRoadmapModel();
            roadmapModel.findCustomerLinkForOrg.mockResolvedValue({
                organizationUuid,
                linearCustomerId: 'cust-1',
                linearCustomerName: 'Acme',
                syncedAt: new Date(),
            });
            roadmapModel.getRoadmapItemsForOrg.mockResolvedValue([
                {
                    title: 'Safe',
                    description: null,
                    status: RoadmapItemStatus.PLANNED,
                    issueUrl: null,
                    pullRequestUrl: null,
                },
                // A leaked internal field must be rejected, not served.
                {
                    title: 'Leaky',
                    description: null,
                    status: RoadmapItemStatus.PLANNED,
                    arr: 50000,
                } as never,
            ]);
            const service = buildService(roadmapModel, createLinearClient());

            const result = await service.getRoadmapForOrg({ organizationUuid });

            expect(result.mapped).toBe(true);
            expect(result.items).toEqual([
                {
                    title: 'Safe',
                    description: null,
                    status: RoadmapItemStatus.PLANNED,
                    issueUrl: null,
                    pullRequestUrl: null,
                },
            ]);
        });
    });
});
