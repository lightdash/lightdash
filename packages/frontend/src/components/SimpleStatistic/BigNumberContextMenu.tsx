import { Menu, MenuItem, Portal } from '@blueprintjs/core';
import { Popover2, Popover2TargetProps } from '@blueprintjs/popover2';
import { fieldId, getFields, ResultRow } from '@lightdash/common';
import { FC, useCallback } from 'react';
import { useExplore } from '../../hooks/useExplore';
import { useVisualizationContext } from '../LightdashVisualization/VisualizationProvider';
import { useUnderlyingDataContext } from '../UnderlyingData/UnderlyingDataProvider';

export const BigNumberContextMenu: FC<{
    isOpen: boolean;
    onClose: () => void;
    position: {
        left: number;
        top: number;
    };
}> = ({ isOpen, onClose, position }) => {
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
    const contextMenuRenderTarget = useCallback(
        ({ ref }: Popover2TargetProps) => (
            <Portal>
                <div style={{ position: 'absolute', ...position }} ref={ref} />
            </Portal>
        ),
        [position],
    );

    const cancelContextMenu = useCallback(
        (e: React.SyntheticEvent<HTMLDivElement>) => e.preventDefault(),
        [],
    );
    return (
        <Popover2
            content={
                <div onContextMenu={cancelContextMenu}>
                    <Menu>
                        <MenuItem
                            text={`View underlying data`}
                            icon={'layers'}
                            onClick={() => {
                                viewUnderlyingData();
                            }}
                        />
                    </Menu>
                </div>
            }
            enforceFocus={false}
            hasBackdrop={true}
            isOpen={isOpen}
            minimal={true}
            onClose={onClose}
            placement="right-start"
            positioningStrategy="fixed"
            rootBoundary={'viewport'}
            renderTarget={contextMenuRenderTarget}
            transitionDuration={100}
        />
    );
};
