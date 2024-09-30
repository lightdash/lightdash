import { type SearchItemType } from '@lightdash/common';
import { Accordion, Text } from '@mantine/core';
import { useEffect, type FC, type MutableRefObject } from 'react';
import { type FocusedItemIndex, type SearchItem } from '../types/searchItem';
import { getSearchItemLabel } from '../utils/getSearchItemLabel';
import OmnibarItem from './OmnibarItem';

type Props = {
    openPanels: SearchItemType[];
    onOpenPanelsChange: (panels: SearchItemType[]) => void;
    projectUuid: string;
    canUserManageValidation: boolean;
    onClick: (item: SearchItem) => void;
    focusedItemIndex?: FocusedItemIndex;
    groupedItems: [SearchItemType, SearchItem[]][];
    scrollRef?: MutableRefObject<HTMLDivElement>;
};

const OmnibarItemGroups: FC<Props> = ({
    openPanels,
    onOpenPanelsChange,
    projectUuid,
    groupedItems,
    canUserManageValidation,
    onClick,
    focusedItemIndex,
    scrollRef,
}) => {
    useEffect(() => {
        if (scrollRef?.current && focusedItemIndex) {
            scrollRef.current.scrollIntoView({
                block: 'center',
            });
        }
    }, [scrollRef, focusedItemIndex]);

    useEffect(() => {
        if (focusedItemIndex) {
            const currentGroupItemType =
                groupedItems[focusedItemIndex.groupIndex][0];

            if (
                currentGroupItemType &&
                !openPanels.includes(currentGroupItemType)
            ) {
                onOpenPanelsChange([currentGroupItemType, ...openPanels]);
            }
        }
    }, [focusedItemIndex, openPanels, onOpenPanelsChange, groupedItems]);

    return (
        <Accordion
            styles={(theme) => ({
                control: {
                    height: theme.spacing.xxl,
                    paddingLeft: theme.spacing.md,
                    paddingRight: theme.spacing.md,
                    backgroundColor: theme.colors.gray[0],
                    '&:hover': {
                        backgroundColor: theme.colors.gray[1],
                    },
                },
                label: {
                    padding: 0,
                },
                content: {
                    padding: theme.spacing.xs,
                },
            })}
            multiple
            value={openPanels}
            onChange={(newPanels: SearchItemType[]) =>
                onOpenPanelsChange(newPanels)
            }
        >
            {groupedItems.map(([groupType, groupItems], groupIndex) => (
                <Accordion.Item key={groupType} value={groupType}>
                    <Accordion.Control>
                        <Text color="dark" fw={500} fz="xs">
                            {getSearchItemLabel(groupType)}
                        </Text>
                    </Accordion.Control>

                    <Accordion.Panel>
                        {groupItems.map((item, itemIndex) => {
                            const isFocused =
                                groupIndex === focusedItemIndex?.groupIndex &&
                                itemIndex === focusedItemIndex?.itemIndex;
                            return (
                                <OmnibarItem
                                    key={itemIndex}
                                    item={item}
                                    scrollRef={
                                        isFocused ? scrollRef : undefined
                                    }
                                    onClick={() => onClick(item)}
                                    projectUuid={projectUuid}
                                    canUserManageValidation={
                                        canUserManageValidation
                                    }
                                    hovered={isFocused}
                                />
                            );
                        })}
                    </Accordion.Panel>
                </Accordion.Item>
            ))}
        </Accordion>
    );
};

export default OmnibarItemGroups;
