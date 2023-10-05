import { Colors, Divider, Menu } from '@blueprintjs/core';
import { ItemListRendererProps } from '@blueprintjs/select';
import {
    Field,
    isField,
    SummaryExplore,
    TableCalculation,
} from '@lightdash/common';
import { Group, Text, Tooltip } from '@mantine/core';
import { IconTable } from '@tabler/icons-react';
import React, { forwardRef, useCallback, useMemo } from 'react';
import styled from 'styled-components';
import MantineIcon from '../../MantineIcon';

type GroupTable = Pick<SummaryExplore, 'name' | 'description'>;

type GroupedItems<T> = {
    group: GroupTable;
    items: T[];
};

type MenuDividerProps = {
    $isFirst: boolean;
};

const Y_PADDING = 5;
const STICK_HEADER_WITHOUT_DIVIDER = -Y_PADDING;
const STICK_HEADER_WITH_DIVIDER = -Y_PADDING - 1;

const MenuDivider = styled.li<MenuDividerProps>`
    position: sticky;

    top: ${({ $isFirst }) =>
        $isFirst ? STICK_HEADER_WITHOUT_DIVIDER : STICK_HEADER_WITH_DIVIDER}px;

    z-index: 1;
    background: ${Colors.WHITE};
    margin: 0;
    padding: ${({ $isFirst }) => ($isFirst ? Y_PADDING : 0)}px 7px
        ${Y_PADDING}px 7px;
    margin-top: ${({ $isFirst }) => ($isFirst ? 0 : Y_PADDING)}px;
`;

const StyledDivider = styled(Divider)`
    margin: 0;
    margin-bottom: 5px;
`;

type StickyMenuDividerProps = {
    index: number;
    title: string;
};

const StickyMenuDivider = forwardRef<HTMLLIElement, StickyMenuDividerProps>(
    ({ index, title }, ref) => (
        <MenuDivider $isFirst={index === 0} ref={ref}>
            {index !== 0 && <StyledDivider />}
            <Group spacing="xs">
                <MantineIcon icon={IconTable} color="gray.6" size="lg" />
                <Text color="gray.6" fw={600}>
                    {title}
                </Text>
            </Group>
        </MenuDivider>
    ),
);

const getItemGroupLabel = (item: Field | TableCalculation) =>
    isField(item) ? item.tableLabel : 'Table Calculations';

const useGroupedItems = <T extends Field | TableCalculation>(
    items: T[],
    tables: GroupTable[],
): GroupedItems<T>[] => {
    const tableMap = useMemo(
        () => new Map(tables.map((table) => [table.name, table])),
        [tables],
    );

    const getGroupedItems = useCallback(
        (filteredItems: typeof items): GroupedItems<T>[] => {
            return filteredItems.reduce<GroupedItems<T>[]>((acc, item) => {
                const table = isField(item)
                    ? tableMap.get(item.table)
                    : undefined;

                const group = {
                    name: getItemGroupLabel(item),
                    description: table?.description,
                };

                const lastGroup = acc[acc.length - 1];
                if (lastGroup && lastGroup.group.name === group.name) {
                    lastGroup.items.push(item);
                } else {
                    acc.push({ group, items: [item] });
                }
                return acc;
            }, []);
        },
        [tableMap],
    );

    return useMemo(() => getGroupedItems(items), [getGroupedItems, items]);
};

type RenderFilterListProps<T> = ItemListRendererProps<T> & {
    tables: Pick<SummaryExplore, 'name' | 'description'>[];
};

const RenderFilterList = <T extends Field | TableCalculation>({
    items,
    itemsParentRef,
    renderItem,
    tables,
}: RenderFilterListProps<T>) => {
    const groupedItems = useGroupedItems<T>(items, tables);

    return (
        <Menu role="listbox" ulRef={itemsParentRef}>
            {groupedItems.map((groupedItem, index) => (
                <React.Fragment key={index}>
                    <Tooltip
                        offset={-2}
                        maw={300}
                        multiline
                        openDelay={500}
                        position="bottom"
                        withinPortal
                        label={groupedItem.group.description}
                        disabled={!groupedItem.group.description}
                    >
                        <StickyMenuDivider
                            index={index}
                            title={groupedItem.group.name}
                        />
                    </Tooltip>

                    {groupedItem.items.map((item, itemIndex) =>
                        renderItem(item, index + itemIndex),
                    )}
                </React.Fragment>
            ))}
        </Menu>
    );
};

export default RenderFilterList;
