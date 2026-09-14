import {
    ActionIcon,
    Group,
    Highlight,
    Paper,
    rem,
    Tooltip,
} from '@mantine/core';
import { IconCheck, IconFolder, IconFolderOpen } from '@tabler/icons-react';
import { clsx } from 'clsx';
import React, { useMemo } from 'react';
import MantineIcon from '../MantineIcon';
import classes from './TreeItem.module.css';

type Props = {
    label: React.ReactNode;
    matchHighlights?: string[];
    expanded?: boolean;
    selected?: boolean;
    hasChildren?: boolean;
    isRoot?: boolean;
    restricted?: boolean;
    className?: string;
    withPadding?: boolean;
    withRootSelectable?: boolean;
    onClick?: () => void;
    onClickExpand?: () => void;
};

const TreeItem: React.FC<Props> = ({
    label,
    matchHighlights = [],
    expanded = false,
    selected = false,
    hasChildren = false,
    withPadding = true,
    withRootSelectable = true,
    isRoot = false,
    restricted = false,
    className,
    onClick,
    onClickExpand,
}) => {
    const stringLabel = useMemo(() => {
        if (typeof label === 'string') {
            return label;
        }
        throw new Error(
            'TreeItem label must always be a string in order to use Highlight',
        );
    }, [label]);

    const folderIcon = (
        <MantineIcon
            icon={
                isRoot || (hasChildren && expanded)
                    ? IconFolderOpen
                    : IconFolder
            }
            color="ldGray.7"
            size="lg"
            stroke={1.5}
            className={classes.itemIcon}
        />
    );

    const content = (
        <Paper
            component={Group}
            data-selected={selected}
            data-is-selectable={!restricted && (!isRoot || withRootSelectable)}
            data-restricted={restricted}
            className={clsx(classes.paper, className)}
            miw={rem(200)}
            w="100%"
            gap={rem(4)}
            h={rem(32)}
            ml={isRoot ? rem(-4) : undefined}
            pl={withPadding ? rem(4) : undefined}
            pr={withPadding ? 'xs' : undefined}
            radius="sm"
            withBorder={false}
            wrap="nowrap"
            onClick={restricted ? undefined : onClick}
        >
            {!isRoot && hasChildren ? (
                <ActionIcon
                    aria-label={`${expanded ? 'Collapse' : 'Expand'} ${stringLabel}`}
                    aria-expanded={expanded}
                    className={classes.actionIcon}
                    onClick={(e) => {
                        e.stopPropagation();
                        onClickExpand?.();
                    }}
                    size="xs"
                    variant="transparent"
                >
                    <span
                        className={classes.folderToggle}
                        data-expanded={expanded}
                        aria-hidden
                    >
                        <span className={classes.folderClosed}>
                            <MantineIcon
                                icon={IconFolder}
                                color="ldGray.7"
                                size="lg"
                                stroke={1.5}
                            />
                        </span>
                        <span className={classes.folderOpen}>
                            <MantineIcon
                                icon={IconFolderOpen}
                                color="ldGray.7"
                                size="lg"
                                stroke={1.5}
                            />
                        </span>
                    </span>
                </ActionIcon>
            ) : (
                folderIcon
            )}

            <Highlight
                truncate="end"
                fz={rem(13)}
                fw={500}
                flex={1}
                highlight={matchHighlights}
                highlightStyles={{
                    backgroundColor: 'transparent',
                    color: 'var(--mantine-color-blue-8)',
                }}
            >
                {stringLabel}
            </Highlight>

            {!isRoot && selected && (
                <MantineIcon
                    icon={IconCheck}
                    size="lg"
                    color="blue.6"
                    className={classes.itemIcon}
                />
            )}
        </Paper>
    );

    if (restricted) {
        return (
            <Tooltip
                label="You do not have access to this space"
                position="top-start"
            >
                {content}
            </Tooltip>
        );
    }

    return content;
};

export default TreeItem;
