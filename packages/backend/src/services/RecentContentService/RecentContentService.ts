import {
    ChartSourceType,
    ContentType,
    NotFoundError,
    type RecordRecentContentView,
    type SessionUser,
} from '@lightdash/common';
import type { RecentContentModel } from '../../models/RecentContentModel';
import { BaseService } from '../BaseService';
import type { ContentService } from '../ContentService/ContentService';

type RecentContentServiceArguments = {
    recentContentModel: RecentContentModel;
    contentService: Pick<ContentService, 'find'>;
};

export class RecentContentService extends BaseService {
    constructor(private readonly args: RecentContentServiceArguments) {
        super();
    }

    async recordView(
        user: SessionUser,
        view: RecordRecentContentView,
    ): Promise<void> {
        const viewedAt = new Date();
        const { data } = await this.args.contentService.find(
            user,
            {
                projectUuids: [view.projectUuid],
                uuids: [view.contentUuid],
                contentTypes: [
                    view.contentType === 'chart'
                        ? ContentType.CHART
                        : ContentType.DASHBOARD,
                ],
            },
            {},
            { page: 1, pageSize: 1 },
        );
        const content = data.find(
            (item) =>
                item.uuid === view.contentUuid &&
                item.contentType === view.contentType,
        );
        if (
            !content ||
            (content.contentType === ContentType.CHART &&
                content.source !== ChartSourceType.DBT_EXPLORE)
        ) {
            throw new NotFoundError('Content not found');
        }
        await this.args.recentContentModel.recordView({
            ...view,
            userUuid: user.userUuid,
            viewedAt,
        });
    }
}
