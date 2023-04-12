import { Colors, Menu, MenuDivider } from '@blueprintjs/core';
import { ItemListRenderer } from '@blueprintjs/select';
import {
    AdditionalMetric,
    Field,
    getItemTableName,
    TableCalculation,
} from '@lightdash/common';
import React from 'react';
import styled from 'styled-components';

const TableName = styled.span`
    font-weight: 600;
    color: ${Colors.GRAY2};
`;

const renderFilterList: ItemListRenderer<
    Field | TableCalculation | AdditionalMetric
> = ({ items, itemsParentRef, query, renderItem }) => {
    const getGroupedItems = (
        filteredItems: (Field | TableCalculation | AdditionalMetric)[],
    ) => {
        return filteredItems.reduce<
            Array<{
                group: string;
                index: number;
                items: (Field | TableCalculation | AdditionalMetric)[];
                key: number;
            }>
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

    const menuContent = getGroupedItems(items).map((groupedItem) => (
        <React.Fragment key={groupedItem.key}>
            <MenuDivider title={<TableName>{groupedItem.group}</TableName>} />
            {groupedItem.items.map((item, index) =>
                renderItem(item, groupedItem.index + index),
            )}
        </React.Fragment>
    ));

    return (
        <Menu role="listbox" ulRef={itemsParentRef}>
            {menuContent}
        </Menu>
    );
};

export default renderFilterList;
