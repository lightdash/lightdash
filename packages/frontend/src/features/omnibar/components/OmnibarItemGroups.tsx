import { Accordion, Text } from '@mantine/core';
import { FC, useMemo } from 'react';
import { SearchItem } from '../types/searchItem';
import { getSearchItemLabel } from '../utils/getSearchItemLabel';
import OmnibarItem from './OmnibarItem';

type Props = {
    openPanels: Array<SearchItem['type']>;
    onOpenPanelsChange: (panels: Array<SearchItem['type']>) => void;
    items: SearchItem[];
    projectUuid: string;
    canUserManageValidation: boolean;
    onClick: (item: SearchItem) => void;
};

type GroupedItems = Partial<Record<SearchItem['type'], SearchItem[]>>;

const OmnibarItemGroups: FC<Props> = ({
    openPanels,
    onOpenPanelsChange,
    projectUuid,
    items,
    canUserManageValidation,
    onClick,
}) => {
    const itemsGroupedByType = useMemo(() => {
        return items.reduce<GroupedItems>((acc, item) => {
            return { ...acc, [item.type]: (acc[item.type] ?? []).concat(item) };
        }, {});
    }, [items]);

    const sortedGroupEntries = useMemo(() => {
        const entries = Object.entries(itemsGroupedByType) as Array<
            [SearchItem['type'], Array<SearchItem>]
        >;

        return entries.sort(([_typeA, itemsA], [_typeB, ItemsB]) => {
            return (itemsA[0].searchRank ?? 0) - (ItemsB[0].searchRank ?? 0);
        });
    }, [itemsGroupedByType]);

    return (
        <Accordion
            styles={(theme) => ({
                control: {
                    height: theme.spacing.xxl,
                    paddingLeft: theme.spacing.md,
                    paddingRight: theme.spacing.md,
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
            onChange={(newPanels: Array<SearchItem['type']>) =>
                onOpenPanelsChange(newPanels)
            }
        >
            {sortedGroupEntries.map(([type, groupItems]) => (
                <Accordion.Item key={type} value={type}>
                    <Accordion.Control>
                        <Text color="dark" fw={500} fz="xs">
                            {getSearchItemLabel(type as SearchItem['type'])}
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
