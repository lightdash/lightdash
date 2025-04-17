import { ActionIcon, Group, Paper, rem, Text } from '@lightdash/mantine-v7';
import {
    IconCheck,
    IconChevronDown,
    IconChevronRight,
    IconFolder,
} from '@tabler/icons-react';
import React from 'react';

import MantineIcon from '../MantineIcon';

import classes from './TreeItem.module.css';

type Props = {
    label: React.ReactNode;
    expanded?: boolean;
    selected?: boolean;
    hasChildren?: boolean;
    withPadding?: boolean;
    isRoot?: boolean;
    onToggleSelect?: () => void;
    onToggleExpand?: () => void;
};

const TreeItem: React.FC<Props> = ({
    label,
    expanded = false,
    selected = false,
    hasChildren = false,
    withPadding = true,
    isRoot = false,
    onToggleSelect,
    onToggleExpand,
}) => {
    return (
        <Paper
            component={Group}
            data-selected={selected}
            data-is-root={isRoot}
            className={classes.paper}
            miw={rem(200)}
            maw={rem(300)}
            gap={rem(4)}
            wrap="nowrap"
            h={rem(32)}
            px={withPadding ? 'xs' : undefined}
            radius="sm"
            onClick={onToggleSelect}
        >
            {hasChildren && (
                <ActionIcon
                    className={classes.actionIcon}
                    onClick={(e) => {
                        e.stopPropagation();
                        onToggleExpand?.();
                    }}
                    size="xs"
                    variant="transparent"
                >
                    <MantineIcon
                        icon={expanded ? IconChevronDown : IconChevronRight}
                        size="lg"
                    />
                </ActionIcon>
            )}

            <MantineIcon
                icon={IconFolder}
                color="gray.7"
                size="lg"
                stroke={1.5}
                style={{ flexShrink: 0 }}
            />

            <Text
                inline
                truncate="end"
                fz={rem(13)}
                fw={500}
                style={{ flexGrow: 1 }}
            >
                {label}
            </Text>

            {selected && (
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
