import { Menu, Position } from '@blueprintjs/core';
import { MenuItem2, Popover2, Popover2Props } from '@blueprintjs/popover2';
import { getItemId, isField, isMetric, ResultRow } from '@lightdash/common';
import { FC, useCallback, useMemo } from 'react';
import { useExplore } from '../../hooks/useExplore';
import { useVisualizationContext } from '../LightdashVisualization/VisualizationProvider';
import DrillDownMenuItem from '../UnderlyingData/DrillDownMenuItem';
import { useUnderlyingDataContext } from '../UnderlyingData/UnderlyingDataProvider';

interface BigNumberContextMenuProps {
    renderTarget: Popover2Props['renderTarget'];
}

export const BigNumberContextMenu: FC<BigNumberContextMenuProps> = ({
    renderTarget,
}) => {
    const { resultsData, bigNumberConfig } = useVisualizationContext();
    const { viewData, tableName } = useUnderlyingDataContext();
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
            viewData(value, meta, row);
        }
    }, [explore, resultsData, bigNumberConfig, viewData]);

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
                    {isField(selectedItem) &&
                        isMetric(selectedItem) &&
                        explore &&
                        resultsData && (
                            <DrillDownMenuItem
                                row={resultsData.rows[0]}
                                explore={explore}
                                metricQuery={resultsData.metricQuery}
                                drillByMetric={getItemId(selectedItem)}
                            />
                        )}
                </Menu>
            }
        />
    );
};
