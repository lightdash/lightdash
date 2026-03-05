import {
    MARKDOWN_TILE_CLASS,
    type DashboardMarkdownTile,
} from '@lightdash/common';
import { Box, Menu, useMantineColorScheme } from '@mantine-8/core';
import { IconCopy } from '@tabler/icons-react';
import MarkdownPreview from '@uiw/react-markdown-preview';
import React, { useCallback, useMemo, useState, type FC } from 'react';
import rehypeExternalLinks from 'rehype-external-links';
import { v4 as uuid4 } from 'uuid';
import { DashboardTileComments } from '../../features/comments';
import { appendNewTilesToBottom } from '../../hooks/dashboard/useDashboard';
import useDashboardStorage from '../../hooks/dashboard/useDashboardStorage';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import MantineIcon from '../common/MantineIcon';
import styles from './DashboardMarkdownTile.module.css';
import TileBase from './TileBase/index';

export type Props = Pick<
    React.ComponentProps<typeof TileBase>,
    'tile' | 'onEdit' | 'onDelete' | 'isEditMode'
> & {
    tile: DashboardMarkdownTile;
};

const MarkdownTile: FC<Props> = (props) => {
    const { colorScheme } = useMantineColorScheme();

    const {
        tile: {
            properties: { title, content, hideFrame },
            uuid,
        },
        isEditMode,
    } = props;

    const [isCommentsMenuOpen, setIsCommentsMenuOpen] = useState(false);
    const showComments = useDashboardContext(
        (c) => c.dashboardCommentsCheck?.canViewDashboardComments,
    );
    const dashboardTiles = useDashboardContext((c) => c.dashboardTiles);
    const { getUnsavedDashboardTiles } = useDashboardStorage();
    const tileHasComments = useDashboardContext((c) => c.hasTileComments(uuid));
    const setDashboardTiles = useDashboardContext((c) => c.setDashboardTiles);
    const setHaveTilesChanged = useDashboardContext(
        (c) => c.setHaveTilesChanged,
    );
    const unsavedDashboardTiles = getUnsavedDashboardTiles();

    const dashboardComments = useMemo(
        () =>
            !!showComments && (
                <DashboardTileComments
                    opened={isCommentsMenuOpen}
                    onOpen={() => setIsCommentsMenuOpen(true)}
                    onClose={() => setIsCommentsMenuOpen(false)}
                    dashboardTileUuid={props.tile.uuid}
                />
            ),
        [showComments, isCommentsMenuOpen, props.tile.uuid],
    );

    const handleDuplicate = useCallback(() => {
        const newTile: DashboardMarkdownTile = {
            ...props.tile,
            uuid: uuid4(),
        };

        const existingTiles =
            unsavedDashboardTiles?.length > 0
                ? unsavedDashboardTiles
                : dashboardTiles;

        setDashboardTiles(
            appendNewTilesToBottom(existingTiles || [], [newTile]),
        );
        setHaveTilesChanged(true);
    }, [
        props.tile,
        unsavedDashboardTiles,
        dashboardTiles,
        setDashboardTiles,
        setHaveTilesChanged,
    ]);

    return (
        <TileBase
            title={hideFrame ? '' : title}
            transparent={hideFrame}
            lockHeaderVisibility={isCommentsMenuOpen}
            visibleHeaderElement={
                tileHasComments ? dashboardComments : undefined
            }
            extraHeaderElement={tileHasComments ? undefined : dashboardComments}
            extraMenuItems={
                isEditMode && (
                    <Menu.Item
                        leftSection={<MantineIcon icon={IconCopy} />}
                        onClick={handleDuplicate}
                    >
                        Duplicate
                    </Menu.Item>
                )
            }
            {...props}
        >
            <Box className={`non-draggable ${styles.markdownContainer}`}>
                <div data-color-mode={colorScheme}>
                    <MarkdownPreview
                        className={MARKDOWN_TILE_CLASS}
                        source={content}
                        rehypePlugins={[
                            [rehypeExternalLinks, { target: '_blank' }],
                        ]}
                    />
                </div>
            </Box>
        </TileBase>
    );
};

export default MarkdownTile;
