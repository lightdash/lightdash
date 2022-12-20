import { Menu, Position } from '@blueprintjs/core';
import { MenuItem2, Popover2, Popover2Props } from '@blueprintjs/popover2';
import { ResultRow } from '@lightdash/common';
import { FC, useCallback, useMemo } from 'react';
import { useExplore } from '../../hooks/useExplore';
import { useVisualizationContext } from '../LightdashVisualization/VisualizationProvider';
import DrillDownMenuItem from '../MetricQueryData/DrillDownMenuItem';
import { useMetricQueryDataContext } from '../MetricQueryData/MetricQueryDataProvider';

interface BigNumberContextMenuProps {
    renderTarget: Popover2Props['renderTarget'];
}

export const BigNumberContextMenu: FC<BigNumberContextMenuProps> = ({
    renderTarget,
}) => {
    const { resultsData, bigNumberConfig } = useVisualizationContext();
    const { openUnderlyingDataModel, tableName } = useMetricQueryDataContext();
    const { data: explore } = useExplore(tableName);

    const selectedItem = useMemo(
        () =>
            bigNumberConfig?.selectedField
                ? bigNumberConfig.getField(bigNumberConfig.selectedField)
                : undefined,
        [bigNumberConfig],
    );

    const viewUnderlyingData = useCallback(() => {
        if (
            explore !== undefined &&
            bigNumberConfig.selectedField !== undefined
        ) {
            const meta = {
                item: bigNumberConfig.getField(bigNumberConfig.selectedField),
            };

            const row: ResultRow = resultsData?.rows?.[0] || {};
            const value = row[bigNumberConfig.selectedField]?.value;
            openUnderlyingDataModel(value, meta, row);
        }
    }, [explore, resultsData, bigNumberConfig, openUnderlyingDataModel]);

    return (
        <Popover2
            lazy
            minimal
            position={Position.BOTTOM}
            renderTarget={renderTarget}
            content={
                <Menu>
                    <MenuItem2
                        text="View underlying data"
                        icon="layers"
                        onClick={() => {
                            viewUnderlyingData();
                        }}
                    />
                    <DrillDownMenuItem
                        row={resultsData?.rows[0]}
                        selectedItem={selectedItem}
                    />
                </Menu>
            }
        />
    );
};
