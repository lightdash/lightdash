import { Box, Group, Text, UnstyledButton } from '@mantine-8/core';
import { IconChevronDown, IconChevronRight } from '@tabler/icons-react';
import { useEffect, type FC, type MutableRefObject } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import {
    type FocusedItemIndex,
    type OmnibarGroup,
    type SearchItem,
} from '../types/searchItem';
import OmnibarItem from './OmnibarItem';
import classes from './OmnibarItemGroups.module.css';

type Props = {
    projectUuid: string;
    canUserManageValidation: boolean;
    onClick: (item: SearchItem, redirect: boolean) => void;
    focusedItemIndex?: FocusedItemIndex;
    onFocusedItemChange: (index: FocusedItemIndex) => void;
    onToggleGroup: (key: string) => void;
    groups: OmnibarGroup[];
    scrollRef?: MutableRefObject<HTMLDivElement>;
};

const OmnibarItemGroups: FC<Props> = ({
    projectUuid,
    groups,
    canUserManageValidation,
    onClick,
    focusedItemIndex,
    onFocusedItemChange,
    onToggleGroup,
    scrollRef,
}) => {
    useEffect(() => {
        if (scrollRef?.current && focusedItemIndex) {
            scrollRef.current.scrollIntoView({
                block: 'nearest',
            });
        }
    }, [scrollRef, focusedItemIndex]);

    return (
        <Box className={classes.groups}>
            {groups.map((group, groupIndex) => (
                <Box key={group.key} className={classes.group}>
                    <UnstyledButton
                        className={classes.groupLabel}
                        onClick={() => onToggleGroup(group.key)}
                        aria-expanded={!group.collapsed}
                    >
                        <Group gap={6} wrap="nowrap">
                            <MantineIcon
                                icon={
                                    group.collapsed
                                        ? IconChevronRight
                                        : IconChevronDown
                                }
                                size="sm"
                                strokeWidth={1.5}
                                className={classes.groupChevron}
                            />
                            <Text
                                fz="xs"
                                fw={600}
                                className={classes.groupLabelText}
                            >
                                {group.label}
                            </Text>
                            <Text fz="xs" className={classes.groupCount}>
                                {group.totalCount}
                            </Text>
                        </Group>
                    </UnstyledButton>

                    {group.items.map((item, itemIndex) => {
                        const isFocused =
                            groupIndex === focusedItemIndex?.groupIndex &&
                            itemIndex === focusedItemIndex?.itemIndex;
                        return (
                            <OmnibarItem
                                key={itemIndex}
                                item={item}
                                scrollRef={isFocused ? scrollRef : undefined}
                                onClick={(e: React.MouseEvent) => {
                                    onClick(item, e.metaKey);
                                }}
                                onMouseMove={
                                    isFocused
                                        ? undefined
                                        : () =>
                                              onFocusedItemChange({
                                                  groupIndex,
                                                  itemIndex,
                                              })
                                }
                                projectUuid={projectUuid}
                                canUserManageValidation={
                                    canUserManageValidation
                                }
                                hovered={isFocused}
                            />
                        );
                    })}
                </Box>
            ))}
        </Box>
    );
};

export default OmnibarItemGroups;
