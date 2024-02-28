import { SearchItemType } from '@lightdash/common';
import { Accordion, Text } from '@mantine/core';
import { FC } from 'react';
import { FocusedItemIndex, SearchItem } from '../types/searchItem';
import { getSearchItemLabel } from '../utils/getSearchItemLabel';
import OmnibarItem from './OmnibarItem';

type Props = {
    openPanels: SearchItemType[];
    onOpenPanelsChange: (panels: SearchItemType[]) => void;
    projectUuid: string;
    canUserManageValidation: boolean;
    onClick: (item: SearchItem) => void;
    focusedItemIndex?: FocusedItemIndex;
    groupedItems: [string, SearchItem[]][];
};

const OmnibarItemGroups: FC<Props> = ({
    openPanels,
    onOpenPanelsChange,
    projectUuid,
    groupedItems,
    canUserManageValidation,
    onClick,
    focusedItemIndex,
}) => {
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
                <Accordion.Item key={groupType} value={groupItems[0].type}>
                    <Accordion.Control>
                        <Text color="dark" fw={500} fz="xs">
                            {getSearchItemLabel(groupItems[0].type)}
                        </Text>
                    </Accordion.Control>

                    <Accordion.Panel>
                        {groupItems.map((item, itemIndex) => (
                            <OmnibarItem
                                key={itemIndex}
                                item={item}
                                onClick={() => onClick(item)}
                                projectUuid={projectUuid}
                                canUserManageValidation={
                                    canUserManageValidation
                                }
                                hovered={
                                    groupIndex ===
                                        focusedItemIndex?.groupIndex &&
                                    itemIndex === focusedItemIndex?.itemIndex
                                }
                            />
                        ))}
                    </Accordion.Panel>
                </Accordion.Item>
            ))}
        </Accordion>
    );
};

export default OmnibarItemGroups;
