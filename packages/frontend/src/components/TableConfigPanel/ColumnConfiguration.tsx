import { Button, Classes, InputGroup } from '@blueprintjs/core';
import { Tooltip2 } from '@blueprintjs/popover2';
import { isDimension } from '@lightdash/common';
import {
    IconEye,
    IconEyeOff,
    IconLock,
    IconLockOpen,
} from '@tabler/icons-react';
import React from 'react';
import { useVisualizationContext } from '../LightdashVisualization/VisualizationProvider';
import { ColumnConfigurationWrapper } from './ColumnConfiguration.styles';

export const ColumnConfiguration: React.FC = () => {
    const {
        pivotDimensions,
        tableConfig: {
            selectedItemIds,
            updateColumnProperty,
            getFieldLabelOverride,
            getFieldLabelDefault,
            isColumnVisible,
            isColumnFrozen,
            getField,
        },
    } = useVisualizationContext();
    return (
        <ColumnConfigurationWrapper>
            {selectedItemIds?.map((fieldId) => {
                const field = getField(fieldId);
                const isPivotingDimension = pivotDimensions?.includes(fieldId);
                const disableHidingDimensions =
                    pivotDimensions && isDimension(field);

                return (
                    <InputGroup
                        key={fieldId}
                        fill
                        disabled={
                            !isColumnVisible(fieldId) &&
                            !disableHidingDimensions
                        }
                        defaultValue={getFieldLabelOverride(fieldId)}
                        placeholder={getFieldLabelDefault(fieldId)}
                        onBlur={(e) => {
                            updateColumnProperty(fieldId, {
                                name: e.currentTarget.value,
                            });
                        }}
                        rightElement={
                            <>
                                <Tooltip2
                                    position="top-right"
                                    content={
                                        isPivotingDimension
                                            ? "Can't hide pivot dimensions"
                                            : disableHidingDimensions
                                            ? 'Cannot hide dimensions when pivoting'
                                            : isColumnVisible(fieldId)
                                            ? 'Hide column'
                                            : 'Show column'
                                    }
                                >
                                    <Button
                                        className={
                                            disableHidingDimensions ||
                                            pivotDimensions?.includes(fieldId)
                                                ? Classes.DISABLED
                                                : undefined
                                        }
                                        active={!isColumnVisible(fieldId)}
                                        icon={
                                            isColumnVisible(fieldId) ? (
                                                <IconEyeOff size={18} />
                                            ) : (
                                                <IconEye size={18} />
                                            )
                                        }
                                        onClick={() => {
                                            if (!disableHidingDimensions) {
                                                updateColumnProperty(fieldId, {
                                                    visible:
                                                        !isColumnVisible(
                                                            fieldId,
                                                        ),
                                                });
                                            }
                                        }}
                                    />
                                </Tooltip2>

                                {!pivotDimensions ? (
                                    <Tooltip2
                                        position="top-right"
                                        content={
                                            isColumnFrozen(fieldId)
                                                ? 'Unfreeze column'
                                                : 'Freeze column'
                                        }
                                    >
                                        <Button
                                            active={isColumnFrozen(fieldId)}
                                            icon={
                                                isColumnFrozen(fieldId) ? (
                                                    <IconLock size={18} />
                                                ) : (
                                                    <IconLockOpen size={18} />
                                                )
                                            }
                                            onClick={() => {
                                                updateColumnProperty(fieldId, {
                                                    frozen: !isColumnFrozen(
                                                        fieldId,
                                                    ),
                                                });
                                            }}
                                        />
                                    </Tooltip2>
                                ) : null}
                            </>
                        }
                    />
                );
            })}
        </ColumnConfigurationWrapper>
    );
};

export default ColumnConfiguration;
