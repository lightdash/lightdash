import { SearchItemType } from '@lightdash/common';
import { Accordion, Text } from '@mantine/core';
import { FC, useMemo } from 'react';
import { SearchItem } from '../types/searchItem';
import { SearchResultMap } from '../types/searchResultMap';
import { getSearchItemLabel } from '../utils/getSearchItemLabel';
import OmnibarItem from './OmnibarItem';

type Props = {
    openPanels: SearchItemType[];
    onOpenPanelsChange: (panels: SearchItemType[]) => void;
    searchResults: SearchResultMap;
    projectUuid: string;
    canUserManageValidation: boolean;
    onClick: (item: SearchItem) => void;
};

const OmnibarItemGroups: FC<Props> = ({
    openPanels,
    onOpenPanelsChange,
    projectUuid,
    searchResults,
    canUserManageValidation,
    onClick,
}) => {
    console.log(searchResults);

    const sortedGroupEntries = useMemo(() => {
        return Object.entries(searchResults)
            .filter(([_type, items]) => items.length > 0)
            .sort(
                ([_typeA, itemsA], [_typeB, ItemsB]) =>
                    (itemsA[0].searchRank ?? 0) - (ItemsB[0].searchRank ?? 0),
            );
    }, [searchResults]);

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
            {sortedGroupEntries.map(([groupType, groupItems]) => (
                <Accordion.Item key={groupType} value={groupItems[0].type}>
                    <Accordion.Control>
                        <Text color="dark" fw={500} fz="xs">
                            {getSearchItemLabel(groupItems[0].type)}
                        </Text>
                    </Accordion.Control>

                    <Accordion.Panel>
                        {groupItems.map((item) => (
                            <OmnibarItem
                                key={item.location.pathname}
                                item={item}
                                onClick={() => onClick(item)}
                                projectUuid={projectUuid}
                                canUserManageValidation={
                                    canUserManageValidation
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
