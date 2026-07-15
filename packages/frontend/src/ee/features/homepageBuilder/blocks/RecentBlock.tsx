import {
    ContentType,
    type ApiError,
    type HomepageRecentlyViewedItem,
    type SummaryContent,
} from '@lightdash/common';
import { Skeleton, Stack } from '@mantine-8/core';
import {
    IconChartBar,
    IconClock,
    IconLayoutDashboard,
} from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { type FC } from 'react';
import { Link } from 'react-router';
import { lightdashApi } from '../../../../api';
import { useTimeAgo } from '../../../../hooks/useTimeAgo';
import { useCollectionContent } from '../hooks/useCollectionContent';
import { BlockHeader } from './BlockShell';
import classes from './blockStyles.module.css';
import { type BlockComponentProps, type BuildComponentProps } from './types';

const getRecentlyViewed = async (projectUuid: string) =>
    lightdashApi<HomepageRecentlyViewedItem[]>({
        url: `/projects/${projectUuid}/homepage/recently-viewed`,
        method: 'GET',
        body: undefined,
    });

const useRecentlyViewed = (projectUuid: string) =>
    useQuery<HomepageRecentlyViewedItem[], ApiError>({
        queryKey: ['homepage_recently_viewed', projectUuid],
        queryFn: () => getRecentlyViewed(projectUuid),
    });

const contentUrl = (projectUuid: string, content: SummaryContent): string =>
    content.contentType === ContentType.DASHBOARD
        ? `/projects/${projectUuid}/dashboards/${content.uuid}/view`
        : `/projects/${projectUuid}/saved/${content.uuid}`;

const RecentRow: FC<{
    content: SummaryContent;
    projectUuid: string;
    viewedAt: Date | undefined;
}> = ({ content, projectUuid, viewedAt }) => {
    const timeAgo = useTimeAgo(viewedAt ?? new Date(0));
    const isDashboard = content.contentType === ContentType.DASHBOARD;
    return (
        <Link
            to={contentUrl(projectUuid, content)}
            className={`${classes.listRow} ${classes.clickable} ${classes.plainLink}`}
        >
            <div className={classes.iconSquare}>
                {isDashboard ? (
                    <IconLayoutDashboard size={16} />
                ) : (
                    <IconChartBar size={16} />
                )}
            </div>
            <div className={classes.flexFill}>
                <div className={classes.rowName}>{content.name}</div>
                <div className={classes.rowMeta}>
                    {isDashboard ? 'Dashboard' : 'Chart'}
                </div>
            </div>
            {viewedAt ? (
                <span className={classes.rowAside}>{timeAgo}</span>
            ) : null}
        </Link>
    );
};

const RecentList: FC<{ projectUuid: string }> = ({ projectUuid }) => {
    const { data: recents, isInitialLoading } = useRecentlyViewed(projectUuid);
    const uuids = (recents ?? []).map((item) => item.uuid);
    const { data: contents, isInitialLoading: isResolving } =
        useCollectionContent(projectUuid, uuids);

    if (isInitialLoading || isResolving) {
        return (
            <Stack gap="xs">
                {[0, 1, 2].map((i) => (
                    <Skeleton key={i} h={52} radius="md" />
                ))}
            </Stack>
        );
    }
    if (!contents || contents.length === 0) {
        return (
            <div className={classes.dashedEmpty}>
                Charts and dashboards you open will show up here.
            </div>
        );
    }
    const viewedAtByUuid = new Map(
        (recents ?? []).map((item) => [item.uuid, item.viewedAt]),
    );
    return (
        <div className={classes.listCard}>
            {contents.map((content) => (
                <RecentRow
                    key={content.uuid}
                    content={content}
                    projectUuid={projectUuid}
                    viewedAt={viewedAtByUuid.get(content.uuid)}
                />
            ))}
        </div>
    );
};

export const RecentBlockView: FC<BlockComponentProps> = ({
    block,
    projectUuid,
}) => {
    if (block.type !== 'recent') return null;
    return (
        <Stack gap={0}>
            <BlockHeader
                icon={IconClock}
                title={block.config.title}
                pill="Personal per viewer"
            />
            <RecentList projectUuid={projectUuid} />
        </Stack>
    );
};

export const RecentBlockBuild: FC<BuildComponentProps> = ({
    block,
    projectUuid,
}) => {
    if (block.type !== 'recent') return null;
    return (
        <Stack gap={0}>
            <BlockHeader
                icon={IconClock}
                title={block.config.title}
                pill="Personal per viewer"
            />
            <RecentList projectUuid={projectUuid} />
            <div className={classes.buildHint}>
                Showing your recent activity as a sample — every viewer sees
                their own.
            </div>
        </Stack>
    );
};
