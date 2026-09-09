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
