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
