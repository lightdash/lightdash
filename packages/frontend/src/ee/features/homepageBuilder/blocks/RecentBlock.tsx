import {
    contentToResourceViewItem,
    type SummaryContent,
} from '@lightdash/common';
import { Group, Skeleton, Stack } from '@mantine/core';
import { IconClock } from '@tabler/icons-react';
import { type FC } from 'react';
import { Link } from 'react-router';
import { FavoriteActionIcon } from '../../../../components/common/FavoriteActionIcon';
import { ResourceIcon } from '../../../../components/common/ResourceIcon';
import {
    getResourceUrl,
    getResourceName,
} from '../../../../components/common/ResourceView/resourceUtils';
import TruncatedText from '../../../../components/common/TruncatedText';
import { useProjectUrlIdentifier } from '../../../../hooks/useProjectRoute';
import { useTimeAgo } from '../../../../hooks/useTimeAgo';
import {
    useHomepageFavorites,
    type HomepageFavorite,
} from '../hooks/useHomepageFavorites';
import { useRecentContents } from '../hooks/useRecentContents';
import { BlockHeader } from './BlockShell';
import classes from './blockStyles.module.css';
import { type BlockComponentProps, type BuildComponentProps } from './types';

const RecentRow: FC<{
    content: SummaryContent;
    projectUuid: string;
    viewedAt: Date | undefined;
    star: HomepageFavorite | undefined;
}> = ({ content, projectUuid, viewedAt, star }) => {
    const projectUrlIdentifier = useProjectUrlIdentifier();
    const timeAgo = useTimeAgo(viewedAt ?? new Date(0));
    return (
        <Link
            to={getResourceUrl(
                projectUuid,
                contentToResourceViewItem(content),
                projectUrlIdentifier,
            )}
            className={`${classes.listRow} ${classes.clickable} ${classes.plainLink}`}
            onClick={(event) => {
                if (
                    event.target instanceof Element &&
                    event.target.closest('button')
                ) {
                    event.preventDefault();
                }
            }}
        >
            <div className={classes.iconSquare}>
                <ResourceIcon item={contentToResourceViewItem(content)} />
            </div>
            <div className={classes.flexFill}>
                <Group gap={4} wrap="nowrap">
                    <div className={classes.rowName}>
                        <TruncatedText maxWidth="100%" inline fz="inherit">
                            {content.name}
                        </TruncatedText>
                    </div>
                    {star && (
                        <FavoriteActionIcon
                            size="sm"
                            name={content.name}
                            isFavorite={star.isFavorite}
                            disabled={star.isLoading}
                            className={classes.favoriteAction}
                            onToggle={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                star.onToggle();
                            }}
                        />
                    )}
                </Group>
                <div className={classes.rowMeta}>
                    {getResourceName(content.contentType)}
                </div>
            </div>
            {viewedAt ? (
                <span className={classes.rowAside}>{timeAgo}</span>
            ) : null}
        </Link>
    );
};

export const RecentList: FC<{ projectUuid: string }> = ({ projectUuid }) => {
    const { recents, contents, isLoading } = useRecentContents(projectUuid);
    const starFor = useHomepageFavorites(projectUuid);

    if (isLoading) {
        return (
            <Stack gap="xs">
                {[0, 1, 2].map((i) => (
                    <Skeleton key={i} h={52} radius="md" />
                ))}
            </Stack>
        );
    }
    if (contents.length === 0) {
        return (
            <div className={classes.dashedEmpty}>
                Charts, dashboards and data apps you open will show up here.
            </div>
        );
    }
    const viewedAtByUuid = new Map(
        recents.map((item) => [item.uuid, item.viewedAt]),
    );
    return (
        <div className={classes.listCard}>
            {contents.map((content) => (
                <RecentRow
                    key={content.uuid}
                    content={content}
                    projectUuid={projectUuid}
                    viewedAt={viewedAtByUuid.get(content.uuid)}
                    star={starFor(content)}
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
