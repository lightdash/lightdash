import {
    ChartSourceType,
    ContentType,
    type SummaryContent,
} from '@lightdash/common';
import { defaultSessionUser } from '../../auth/account/account.mock';
import type { RecentContentModel } from '../../models/RecentContentModel';
import { RecentContentService } from './RecentContentService';

describe('RecentContentService.recordView', () => {
    const find = vi.fn();
    const recordView = vi.fn();
    const service = new RecentContentService({
        projectModel: { getSummary: vi.fn() },
        contentService: { find },
        recentContentModel: { recordView } as unknown as RecentContentModel,
    });
    const view = {
        projectUuid: 'project',
        contentType: 'chart' as const,
        contentUuid: 'chart',
    };

    beforeEach(() => {
        vi.resetAllMocks();
    });

    it('records the authenticated viewer after a scoped permission-aware lookup', async () => {
        find.mockResolvedValue({
            data: [
                {
                    uuid: 'chart',
                    contentType: ContentType.CHART,
                    source: ChartSourceType.DBT_EXPLORE,
                } as SummaryContent,
            ],
        });
        await service.recordView(defaultSessionUser, view);
        expect(find).toHaveBeenCalledWith(
            defaultSessionUser,
            {
                projectUuids: ['project'],
                uuids: ['chart'],
                contentTypes: [ContentType.CHART],
                dataAppVizsFilter: 'exclude',
            },
            {},
            { page: 1, pageSize: 1 },
        );
        expect(recordView).toHaveBeenCalledWith({
            ...view,
            userUuid: defaultSessionUser.userUuid,
            viewedAt: expect.any(Date),
        });
    });

    it('does not record missing, deleted or inaccessible content', async () => {
        find.mockResolvedValue({ data: [] });
        await expect(
            service.recordView(defaultSessionUser, view),
        ).rejects.toThrow('Content not found');
        expect(recordView).not.toHaveBeenCalled();
    });

    it('records a directly shared app using the viewer-scoped fallback', async () => {
        const appView = {
            ...view,
            contentType: 'data_app' as const,
            contentUuid: 'app',
        };
        find.mockResolvedValueOnce({ data: [] }).mockResolvedValueOnce({
            data: [
                {
                    uuid: 'app',
                    contentType: ContentType.DATA_APP,
                    space: { uuid: 'restricted-space' },
                },
            ],
        });
        await service.recordView(defaultSessionUser, appView);
        expect(find).toHaveBeenLastCalledWith(
            defaultSessionUser,
            expect.objectContaining({
                projectUuids: ['project'],
                uuids: ['app'],
                contentTypes: [ContentType.DATA_APP],
                sharedWithMe: true,
                dataAppVizsFilter: 'exclude',
            }),
            {},
            expect.anything(),
        );
        expect(recordView).toHaveBeenCalledWith({
            ...appView,
            userUuid: defaultSessionUser.userUuid,
            viewedAt: expect.any(Date),
        });
    });

    it('does not record an app when neither space nor direct access permits it', async () => {
        find.mockResolvedValue({ data: [] });
        await expect(
            service.recordView(defaultSessionUser, {
                ...view,
                contentType: 'data_app',
            }),
        ).rejects.toThrow('Content not found');
        expect(recordView).not.toHaveBeenCalled();
    });

    it('does not treat SQL charts as explorer charts', async () => {
        find.mockResolvedValue({
            data: [
                {
                    uuid: 'chart',
                    contentType: ContentType.CHART,
                    source: ChartSourceType.SQL,
                } as SummaryContent,
            ],
        });
        await expect(
            service.recordView(defaultSessionUser, view),
        ).rejects.toThrow('Content not found');
        expect(recordView).not.toHaveBeenCalled();
    });
});

describe('RecentContentService.getRecentlyViewed', () => {
    const findContent = vi.fn();
    const findRecent = vi.fn();
    const getSummary = vi.fn();
    const service = new RecentContentService({
        projectModel: { getSummary },
        contentService: { find: findContent },
        recentContentModel: {
            find: findRecent,
        } as unknown as RecentContentModel,
    });
    const candidates = Array.from({ length: 50 }, (_, index) => ({
        contentType: 'chart' as const,
        uuid: `chart-${index}`,
        viewedAt: new Date(2026, 8, 9, 0, 0, 50 - index),
    }));
    const contentFor = (uuid: string): SummaryContent =>
        ({
            uuid,
            contentType: ContentType.CHART,
            source: ChartSourceType.DBT_EXPLORE,
            project: { uuid: 'project' },
        }) as SummaryContent;

    beforeEach(() => {
        vi.resetAllMocks();
        getSummary.mockResolvedValue({
            organizationUuid: defaultSessionUser.organizationUuid,
        });
        findRecent.mockResolvedValue(candidates);
    });

    it('filters before limiting and preserves recency despite hydration order', async () => {
        findContent.mockResolvedValue({
            data: candidates
                .slice(20)
                .map((item) => contentFor(item.uuid))
                .reverse(),
        });
        const entries = await service.getRecentlyViewed(
            defaultSessionUser,
            'project',
        );
        expect(entries.map((item) => item.uuid)).toEqual(
            candidates.slice(20, 30).map((item) => item.uuid),
        );
        expect(entries[0].content).toEqual(contentFor('chart-20'));
        expect(findRecent).toHaveBeenCalledWith(
            defaultSessionUser.userUuid,
            'project',
        );
        expect(findContent).toHaveBeenCalledWith(
            defaultSessionUser,
            expect.objectContaining({
                projectUuids: ['project'],
                uuids: candidates.map((item) => item.uuid),
                chart: { sources: [ChartSourceType.DBT_EXPLORE] },
            }),
            {},
            { page: 1, pageSize: 100 },
        );
    });

    it('returns no references for deleted or inaccessible content', async () => {
        findContent.mockResolvedValue({ data: [] });
        expect(
            await service.getRecentlyViewed(defaultSessionUser, 'project'),
        ).toEqual([]);
    });

    it('merges space and directly shared apps in recency order and drops revoked access', async () => {
        const app = (uuid: string) => ({
            uuid,
            contentType: ContentType.DATA_APP,
            project: { uuid: 'project' },
            space: { uuid: 'space' },
        });
        const recentApps = ['direct-app', 'revoked-app', 'space-app'].map(
            (uuid) => ({
                uuid,
                contentType: 'data_app' as const,
                viewedAt: new Date(),
            }),
        );
        findRecent.mockResolvedValue([...recentApps, candidates[0]]);
        findContent
            .mockResolvedValueOnce({
                data: [contentFor('chart-0'), app('space-app')],
            })
            .mockResolvedValueOnce({ data: [app('direct-app')] });
        const entries = await service.getRecentlyViewed(
            defaultSessionUser,
            'project',
        );
        expect(entries.map((item) => item.uuid)).toEqual([
            'direct-app',
            'space-app',
            'chart-0',
        ]);
        expect(findContent).toHaveBeenLastCalledWith(
            defaultSessionUser,
            expect.objectContaining({
                uuids: ['direct-app', 'revoked-app'],
                sharedWithMe: true,
            }),
            {},
            expect.anything(),
        );
    });

    it('does not resolve content or fall back to history for an empty table', async () => {
        findRecent.mockResolvedValue([]);
        expect(
            await service.getRecentlyViewed(defaultSessionUser, 'project'),
        ).toEqual([]);
        expect(findContent).not.toHaveBeenCalled();
    });

    it('rejects another organization before reading recency', async () => {
        getSummary.mockResolvedValue({ organizationUuid: 'another-org' });
        await expect(
            service.getRecentlyViewed(defaultSessionUser, 'project'),
        ).rejects.toThrow('Cannot view this project');
        expect(findRecent).not.toHaveBeenCalled();
    });

    it('does not expose content that moved to another project', async () => {
        findContent.mockResolvedValue({
            data: [
                {
                    ...contentFor('chart-0'),
                    project: { uuid: 'other-project' },
                },
            ],
        });
        expect(
            await service.getRecentlyViewed(defaultSessionUser, 'project'),
        ).toEqual([]);
    });
});
