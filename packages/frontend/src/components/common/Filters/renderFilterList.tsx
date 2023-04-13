import { Colors, Menu, MenuDivider } from '@blueprintjs/core';
import { ItemListRendererProps } from '@blueprintjs/select';
import { Field, getItemTableName, TableCalculation } from '@lightdash/common';
import React from 'react';
import styled from 'styled-components';

const TableName = styled.span`
    font-weight: 600;
    color: ${Colors.GRAY2};
`;

const StyledMenuDivider = styled(MenuDivider)`
    position: sticky;
    top: -6px;

    &.bp4-menu-header:not(:first-of-type) {
        top: -16px !important;
    }

    z-index: 1;
    background: ${Colors.WHITE};
    margin: 0;
    padding: 8px 6px;
`;

const renderFilterList = <T extends Field | TableCalculation>({
    items,
    itemsParentRef,
    query,
    renderItem,
}: ItemListRendererProps<T>) => {
    const getGroupedItems = (filteredItems: typeof items) => {
        return filteredItems.reduce<
            {
                group: string;
                index: number;
                items: typeof items;
                key: number;
            }[]
        >((acc, item, index) => {
            const group = getItemTableName(item);

            const lastGroup = acc.at(-1);
            if (lastGroup && lastGroup.group === group) {
                lastGroup.items.push(item);
            } else {
                acc.push({ group, index, items: [item], key: index });
            }
            return acc;
        }, []);
    };

    return (
        <Menu role="listbox" ulRef={itemsParentRef}>
            {getGroupedItems(items).map((groupedItem) => (
                <React.Fragment key={groupedItem.key}>
                    <StyledMenuDivider
                        title={<TableName>{groupedItem.group} </TableName>}
                    />

                    {groupedItem.items.map((item, index) =>
                        renderItem(item, groupedItem.index + index),
                    )}
                </React.Fragment>
            ))}
        </Menu>
    );
};

export default renderFilterList;
