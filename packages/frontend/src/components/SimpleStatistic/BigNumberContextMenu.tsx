import { Menu, Position } from '@blueprintjs/core';
import { MenuItem2, Popover2, Popover2Props } from '@blueprintjs/popover2';
import { ResultRow } from '@lightdash/common';
import { FC, useCallback, useMemo } from 'react';
import CopyToClipboard from 'react-copy-to-clipboard';
import useToaster from '../../hooks/toaster/useToaster';
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
    const { showToastSuccess } = useToaster();
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

    const row: ResultRow = useMemo(() => {
        return resultsData?.rows?.[0] || {};
    }, [resultsData]);

    const value = useMemo(() => {
        if (bigNumberConfig.selectedField) {
            return row[bigNumberConfig.selectedField]?.value;
        }
    }, [row, bigNumberConfig]);

    const viewUnderlyingData = useCallback(() => {
        if (
            explore !== undefined &&
            bigNumberConfig.selectedField !== undefined &&
            value
        ) {
            const meta = {
                item: bigNumberConfig.getField(bigNumberConfig.selectedField),
            };

            openUnderlyingDataModel(value, meta, row);
        }
    }, [explore, bigNumberConfig, row, value, openUnderlyingDataModel]);

    return (
        <Popover2
            lazy
            minimal
            position={Position.BOTTOM}
            renderTarget={renderTarget}
            content={
                <Menu>
                    {value && (
                        <CopyToClipboard
                            text={value.formatted}
                            onCopy={() => {
                                showToastSuccess({
                                    title: 'Copied to clipboard!',
                                });
                            }}
                        >
                            <MenuItem2 text="Copy value" icon="duplicate" />
                        </CopyToClipboard>
                    )}

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
