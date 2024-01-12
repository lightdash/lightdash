import { isDimension } from '@lightdash/common';
import { ActionIcon, Box, Group, TextInput, Tooltip } from '@mantine/core';
import {
    IconEye,
    IconEyeOff,
    IconLock,
    IconLockOpen,
} from '@tabler/icons-react';
import React, { useState } from 'react';
import MantineIcon from '../../common/MantineIcon';
import { isTableVisualizationConfig } from '../../LightdashVisualization/VisualizationConfigTable';
import { useVisualizationContext } from '../../LightdashVisualization/VisualizationProvider';

const ColumnConfiguration: React.FC<{ fieldId: string }> = ({ fieldId }) => {
    const { pivotDimensions, visualizationConfig } = useVisualizationContext();

    const [isShowTooltipVisible, setShowTooltipVisible] = useState(false);
    const [isFreezeTooltipVisible, setFreezeTooltipVisible] = useState(false);

    if (!isTableVisualizationConfig(visualizationConfig)) return null;

    const {
        updateColumnProperty,
        getFieldLabelOverride,
        getFieldLabelDefault,
        isColumnVisible,
        isColumnFrozen,
        getField,
    } = visualizationConfig.chartConfig;

    const field = getField(fieldId);
    const isPivotingDimension = pivotDimensions?.includes(fieldId);
    const disableHidingDimensions = pivotDimensions && isDimension(field);

    return (
        <Group spacing="xs" noWrap style={{ width: '100%' }}>
            <TextInput
                sx={{ flexGrow: 1 }}
                key={fieldId}
                disabled={!isColumnVisible(fieldId) && !disableHidingDimensions}
                defaultValue={getFieldLabelOverride(fieldId)}
                placeholder={getFieldLabelDefault(fieldId)}
                onBlur={(e) => {
                    updateColumnProperty(fieldId, {
                        name: e.currentTarget.value,
                    });
                }}
            />
            <Tooltip
                position="top"
                opened={isShowTooltipVisible}
                withinPortal
                label={
                    isPivotingDimension
                        ? "Can't hide pivot dimensions"
                        : disableHidingDimensions
                        ? 'Cannot hide dimensions when pivoting'
                        : isColumnVisible(fieldId)
                        ? 'Hide column'
                        : 'Show column'
                }
            >
                <Box
                    onMouseEnter={() => setShowTooltipVisible(true)}
                    onMouseLeave={() => setShowTooltipVisible(false)}
                >
                    <ActionIcon
                        disabled={
                            disableHidingDimensions ||
                            pivotDimensions?.includes(fieldId)
                        }
                        variant="light"
                        onClick={() => {
                            // TODO: render perf issues on this page seem to be
                            // causing the tooltips to stay open. This click causes a
                            // lot of re-rendering and it's easy to move the mouse away
                            // before getting mouse events back, so the tooltip
                            // stays open. We could try to solve that wholistically,
                            // but for now work around it by managing the tooltip
                            // and closing it when the button is clicked.
                            setShowTooltipVisible(false);
                            if (!disableHidingDimensions) {
                                updateColumnProperty(fieldId, {
                                    visible: !isColumnVisible(fieldId),
                                });
                            }
                        }}
                    >
                        {isColumnVisible(fieldId) ? (
                            <MantineIcon icon={IconEyeOff} />
                        ) : (
                            <MantineIcon icon={IconEye} />
                        )}
                    </ActionIcon>
                </Box>
            </Tooltip>

            {!pivotDimensions ? (
                <Tooltip
                    position="top"
                    withinPortal
                    opened={isFreezeTooltipVisible}
                    label={
                        isColumnFrozen(fieldId)
                            ? 'Unfreeze column'
                            : 'Freeze column'
                    }
                >
                    <Box
                        onMouseEnter={() => setFreezeTooltipVisible(true)}
                        onMouseLeave={() => setFreezeTooltipVisible(false)}
                    >
                        <ActionIcon
                            variant="light"
                            onClick={() => {
                                // Close the tooltip. See comment above.
                                setFreezeTooltipVisible(false);
                                updateColumnProperty(fieldId, {
                                    frozen: !isColumnFrozen(fieldId),
                                });
                            }}
                        >
                            {isColumnFrozen(fieldId) ? (
                                <MantineIcon icon={IconLock} />
                            ) : (
                                <MantineIcon icon={IconLockOpen} />
                            )}
                        </ActionIcon>
                    </Box>
                </Tooltip>
            ) : null}
        </Group>
    );
};

export default ColumnConfiguration;
