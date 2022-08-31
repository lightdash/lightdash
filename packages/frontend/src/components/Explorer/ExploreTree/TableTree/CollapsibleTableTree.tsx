import { Classes, Collapse, Icon, Text } from '@blueprintjs/core';
import { Tooltip2 } from '@blueprintjs/popover2';
import { AdditionalMetric, CompiledTable } from '@lightdash/common';
import { FC, useMemo } from 'react';
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

    const tableItemsCount = useMemo(() => {
        return (
            Object.values(table.dimensions).filter((i) => !i.hidden).length +
            Object.values(table.metrics).filter((i) => !i.hidden).length +
            additionalMetrics.length
        );
    }, [table, additionalMetrics]);

    return (
        <>
            <TableRow depth={0} onClick={toggle}>
                <RowIcon icon="th" size={16} />

                <Tooltip2
                    lazy
                    content={table.description}
                    className={Classes.TEXT_OVERFLOW_ELLIPSIS}
                >
                    <Text ellipsize>{table.label}</Text>
                </Tooltip2>

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
