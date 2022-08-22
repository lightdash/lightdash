import { Collapse, Icon, Text } from '@blueprintjs/core';
import { AdditionalMetric, CompiledTable } from '@lightdash/common';
import { FC } from 'react';
import { useToggle } from 'react-use';
import { RowIcon, SpanFlex, TableRow, TagCount } from './TableTree.styles';

type Props = {
    table: CompiledTable;
    additionalMetrics: AdditionalMetric[];
};

const CollapsibleTableTree: FC<Props> = ({
    table,
    additionalMetrics,
    children,
}) => {
    const [isOpen, toggle] = useToggle(true);
    const tableItemsCount =
        Object.values(table.dimensions).filter((item) => !item.hidden).length +
        Object.values(table.metrics).filter((item) => !item.hidden).length +
        additionalMetrics.length;
    return (
        <>
            <TableRow depth={0} onClick={toggle}>
                <RowIcon icon={'th'} size={16} />
                <Text ellipsize>{table.label}</Text>
                {!isOpen && (
                    <TagCount minimal round multiline>
                        {tableItemsCount}
                    </TagCount>
                )}
                <SpanFlex />
                <Icon icon={isOpen ? 'chevron-up' : 'chevron-down'} size={16} />
            </TableRow>
            <Collapse isOpen={isOpen}>{children}</Collapse>
        </>
    );
};

export default CollapsibleTableTree;
