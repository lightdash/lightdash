import { Menu, Position } from '@blueprintjs/core';
import { MenuItem2, Popover2, Popover2Props } from '@blueprintjs/popover2';
import { fieldId, getFields, ResultRow } from '@lightdash/common';
import { FC, useCallback } from 'react';
import { useExplore } from '../../hooks/useExplore';
import { useVisualizationContext } from '../LightdashVisualization/VisualizationProvider';
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

    const viewUnderlyingData = useCallback(() => {
        if (
            explore !== undefined &&
            bigNumberConfig.selectedField !== undefined
        ) {
            const fields = getFields(explore);

            const selectedField = fields.find(
                (dimension) =>
                    fieldId(dimension) === bigNumberConfig.selectedField,
            );
            const meta = { item: selectedField };

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
                </Menu>
            }
        />
    );
};
