import { AdditionalMetric, CompiledTable } from '@lightdash/common';
import React, { FC } from 'react';
import { TrackSection } from '../../../../providers/TrackingProvider';
import { SectionName } from '../../../../types/Events';
import CollapsibleTableTree from './CollapsibleTableTree';
import TableTreeSections from './TableTreeSections';

type Props = {
    searchQuery?: string;
    showTableLabel: boolean;
    table: CompiledTable;
    additionalMetrics: AdditionalMetric[];
    selectedItems: Set<string>;
    onSelectedNodeChange: (itemId: string, isDimension: boolean) => void;
};

const TableTree: FC<Props> = ({
    showTableLabel,
    table,
    additionalMetrics,
    ...rest
}) => {
    const Wrapper = showTableLabel ? CollapsibleTableTree : React.Fragment;
    return (
        <TrackSection name={SectionName.SIDEBAR}>
            <Wrapper table={table} additionalMetrics={additionalMetrics}>
                <TableTreeSections
                    depth={showTableLabel ? 1 : 0}
                    table={table}
                    additionalMetrics={additionalMetrics}
                    {...rest}
                />
            </Wrapper>
        </TrackSection>
    );
};

export default TableTree;
