import { subject } from '@casl/ability';
import {
    ChartSourceType,
    ContentType,
    ForbiddenError,
    NotFoundError,
    type RecentContentEntry,
    type RecordRecentContentView,
    type SessionUser,
} from '@lightdash/common';
import type { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import type { RecentContentModel } from '../../models/RecentContentModel';
import { RECENT_CONTENT_CAPACITY } from '../../models/RecentContentModel';
import { BaseService } from '../BaseService';
import type { ContentService } from '../ContentService/ContentService';

type RecentContentServiceArguments = {
    recentContentModel: RecentContentModel;
    contentService: Pick<ContentService, 'find'>;
    projectModel: Pick<ProjectModel, 'getSummary'>;
};

export class RecentContentService extends BaseService {
    constructor(private readonly args: RecentContentServiceArguments) {
        super();
    }

    async getRecentlyViewed(
        user: SessionUser,
        projectUuid: string,
    ): Promise<RecentContentEntry[]> {
        const project = await this.args.projectModel.getSummary(projectUuid);
        if (
            project.organizationUuid !== user.organizationUuid ||
            this.createAuditedAbility(user).cannot(
                'view',
                subject('Project', {
                    organizationUuid: project.organizationUuid,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError('Cannot view this project');
        }
        const candidates = await this.args.recentContentModel.find(
            user.userUuid,
            projectUuid,
        );
        if (candidates.length === 0) return [];
        const { data } = await this.args.contentService.find(
            user,
            {
                projectUuids: [projectUuid],
                uuids: candidates.map((item) => item.uuid),
                contentTypes: [ContentType.CHART, ContentType.DASHBOARD],
                chart: { sources: [ChartSourceType.DBT_EXPLORE] },
            },
            {},
            { page: 1, pageSize: RECENT_CONTENT_CAPACITY * 2 },
        );
        const byId = new Map(
            data.map((content) => [
                `${content.contentType}:${content.uuid}`,
                content,
            ]),
        );
        return candidates
            .flatMap((item): RecentContentEntry[] => {
                const content = byId.get(`${item.contentType}:${item.uuid}`);
                if (
                    !content ||
                    content.project.uuid !== projectUuid ||
                    (content.contentType !== ContentType.CHART &&
                        content.contentType !== ContentType.DASHBOARD)
                )
                    return [];
                if (
                    content.contentType === ContentType.CHART &&
                    content.source !== ChartSourceType.DBT_EXPLORE
                )
                    return [];
                return [{ ...item, content }];
            })
            .slice(0, 10);
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
