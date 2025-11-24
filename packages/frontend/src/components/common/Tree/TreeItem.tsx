import { ActionIcon, Group, Highlight, Paper, rem } from '@mantine-8/core';
import {
    IconCheck,
    IconChevronDown,
    IconChevronRight,
    IconFolder,
} from '@tabler/icons-react';
import React, { useMemo } from 'react';

import MantineIcon from '../MantineIcon';

import { clsx } from '@mantine/core';
import classes from './TreeItem.module.css';

type Props = {
    label: React.ReactNode;
    matchHighlights?: string[];
    expanded?: boolean;
    selected?: boolean;
    hasChildren?: boolean;
    isRoot?: boolean;
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

    return (
        <Paper
            component={Group}
            data-selected={selected}
            data-is-selectable={!isRoot || withRootSelectable}
            className={clsx(classes.paper, className)}
            miw={rem(200)}
            w="100%"
            gap={rem(4)}
            h={rem(32)}
            // This component isn't optimized for the top-level root item,
            // so we apply a negative left margin when the chevron isn't needed.
            // (Root spaces are always expanded and don’t require a chevron.)
            ml={isRoot ? rem(-4) : undefined}
            pl={withPadding ? rem(4) : undefined}
            pr={withPadding ? 'xs' : undefined}
            radius="sm"
            withBorder={false}
            shadow="none"
            wrap="nowrap"
            onClick={onClick}
        >
            {isRoot ? null : (
                <ActionIcon
                    data-has-children={hasChildren}
                    className={classes.actionIcon}
                    onClick={(e) => {
                        e.stopPropagation();
                        onClickExpand?.();
                    }}
                    size="xs"
                    variant="transparent"
                >
                    <MantineIcon
                        icon={expanded ? IconChevronDown : IconChevronRight}
                        size="lg"
                        color="ldGray.6"
                    />
                </ActionIcon>
            )}

            <MantineIcon
                icon={IconFolder}
                color="ldGray.7"
                size="lg"
                stroke={1.5}
                style={{ flexShrink: 0 }}
            />

            <Highlight
                truncate="end"
                fz={rem(13)}
                fw={500}
                style={{ flexGrow: 1 }}
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
                    style={{ flexShrink: 0 }}
                />
            )}
        </Paper>
    );
};

export default TreeItem;
