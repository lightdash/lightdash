import { Collapse, Icon, Tag, Text } from '@blueprintjs/core';
import { AdditionalMetric, CompiledTable } from '@lightdash/common';
import React, { FC } from 'react';
import { useToggle } from 'react-use';
import { Row } from './TableTree.styles';

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
            <Row
                depth={0}
                onClick={toggle}
                style={{
                    fontWeight: 600,
                }}
            >
                <Icon icon={'th'} size={16} style={{ marginRight: 8 }} />
                <Text ellipsize>{table.label}</Text>
                {!isOpen && (
                    <Tag minimal round style={{ marginLeft: 10 }}>
                        {tableItemsCount}
                    </Tag>
                )}
                <span style={{ flex: 1 }} />
                <Icon icon={isOpen ? 'chevron-up' : 'chevron-down'} size={16} />
            </Row>
            <Collapse isOpen={isOpen}>{children}</Collapse>
        </>
    );
};

export default CollapsibleTableTree;
