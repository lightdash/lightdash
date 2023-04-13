import { Colors, Divider, Menu } from '@blueprintjs/core';
import { ItemListRendererProps } from '@blueprintjs/select';
import { Field, getItemTableName, TableCalculation } from '@lightdash/common';
import React, { FC } from 'react';
import styled from 'styled-components';

const TableName = styled.span`
    font-weight: 600;
    color: ${Colors.GRAY2};
`;

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

const StickyMenuDivider: FC<StickyMenuDividerProps> = ({ index, title }) => {
    return (
        <MenuDivider $isFirst={index === 0}>
            {index !== 0 && <StyledDivider />}

            <TableName>{title}</TableName>
        </MenuDivider>
    );
};

const renderFilterList = <T extends Field | TableCalculation>({
    items,
    itemsParentRef,
    query,
    renderItem,
}: ItemListRendererProps<T>) => {
    const getGroupedItems = (filteredItems: typeof items) => {
        return filteredItems.reduce<{ group: string; items: typeof items }[]>(
            (acc, item) => {
                const group = getItemTableName(item);

                const lastGroup = acc.at(-1);
                if (lastGroup && lastGroup.group === group) {
                    lastGroup.items.push(item);
                } else {
                    acc.push({ group, items: [item] });
                }
                return acc;
            },
            [],
        );
    };

    return (
        <Menu role="listbox" ulRef={itemsParentRef}>
            {getGroupedItems(items).map((groupedItem, index) => (
                <React.Fragment key={index}>
                    <StickyMenuDivider
                        index={index}
                        title={groupedItem.group}
                    />

                    {groupedItem.items.map((item, itemIndex) =>
                        renderItem(item, index + itemIndex),
                    )}
                </React.Fragment>
            ))}
        </Menu>
    );
};

export default renderFilterList;
