import { subject } from '@casl/ability';
import {
    ChartSourceType,
    ContentType,
    ForbiddenError,
    NotFoundError,
    type RecentContentEntry,
    type RecentContentType,
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

const CONTENT_TYPES: Record<RecentContentType, ContentType> = {
    chart: ContentType.CHART,
    dashboard: ContentType.DASHBOARD,
    data_app: ContentType.DATA_APP,
};

export class RecentContentService extends BaseService {
    constructor(private readonly args: RecentContentServiceArguments) {
        super();
    }

    private async findSharedApps(
        user: SessionUser,
        projectUuid: string,
        uuids: string[],
    ) {
        if (uuids.length === 0) return [];
        const { data } = await this.args.contentService.find(
            user,
            {
                projectUuids: [projectUuid],
                uuids,
                contentTypes: [ContentType.DATA_APP],
                dataAppVizsFilter: 'exclude',
                sharedWithMe: true,
            },
            {},
            { page: 1, pageSize: RECENT_CONTENT_CAPACITY },
        );
        return data.filter(
            (content) =>
                content.contentType === ContentType.DATA_APP &&
                content.space !== null,
        );
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
                contentTypes: [
                    ContentType.CHART,
                    ContentType.DASHBOARD,
                    ContentType.DATA_APP,
                ],
                dataAppVizsFilter: 'exclude',
                chart: { sources: [ChartSourceType.DBT_EXPLORE] },
            },
            {},
            { page: 1, pageSize: RECENT_CONTENT_CAPACITY * 2 },
        );
        const byId = new Map(
            [
                ...data,
                ...(await this.findSharedApps(
                    user,
                    projectUuid,
                    candidates
                        .filter(
                            (item) =>
                                item.contentType === 'data_app' &&
                                !data.some(
                                    (content) => content.uuid === item.uuid,
                                ),
                        )
                        .map((item) => item.uuid),
                )),
            ].map((content) => [
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
                        content.contentType !== ContentType.DASHBOARD &&
                        content.contentType !== ContentType.DATA_APP)
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
                contentTypes: [CONTENT_TYPES[view.contentType]],
                dataAppVizsFilter: 'exclude',
            },
            {},
            { page: 1, pageSize: 1 },
        );
        if (view.contentType === 'data_app' && data.length === 0) {
            data.push(
                ...(await this.findSharedApps(user, view.projectUuid, [
                    view.contentUuid,
                ])),
            );
        }
        const content = data.find(
            (item) =>
                item.uuid === view.contentUuid &&
                item.contentType === view.contentType,
        );
        if (
            !content ||
            (content.contentType === ContentType.DATA_APP &&
                content.space === null) ||
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
