import { isDimension } from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Group,
    Text,
    TextInput,
    Tooltip,
} from '@mantine-8/core';
import { useDebouncedState } from '@mantine/hooks';
import {
    IconEye,
    IconEyeOff,
    IconLock,
    IconLockOpen,
    IconX,
} from '@tabler/icons-react';
import { useState, type FC } from 'react';
import MantineIcon from '../../common/MantineIcon';
import {
    isTableVisualizationConfig,
    type VisualizationConfigTable,
} from '../../LightdashVisualization/types';
import { useVisualizationContext } from '../../LightdashVisualization/useVisualizationContext';
import styles from './ColumnConfiguration.module.css';

type ColumnConfigurationInputProps = Pick<
    ColumnConfigurationProps,
    'fieldId'
> & {
    chartConfig: VisualizationConfigTable['chartConfig'];
    disableHidingDimensions: boolean;
};

const ColumnConfigurationInput: FC<ColumnConfigurationInputProps> = ({
    fieldId,
    disableHidingDimensions,
    chartConfig: {
        updateColumnProperty,
        isColumnVisible,
        getFieldLabelOverride,
        getFieldLabelDefault,
    },
}) => {
    const [value, setValue] = useDebouncedState(
        getFieldLabelOverride(fieldId) ?? getFieldLabelDefault(fieldId),
        500,
    );

    return (
        <TextInput
            disabled={!isColumnVisible(fieldId) && !disableHidingDimensions}
            placeholder={getFieldLabelDefault(fieldId)}
            defaultValue={value}
            onChange={(e) => {
                setValue(e.currentTarget.value);
                updateColumnProperty(fieldId, {
                    name: e.currentTarget.value,
                });
            }}
        />
    );
};

type ColumnConfigurationProps = {
    fieldId: string;

    /**
     * When provided, the freeze toggle controls all listed fieldIds together.
     */
    syncFreezeWith?: string[];

    /**
     * When true, allow hiding even when the field is a pivot dimension.
     * Used by the hide-pivot-dimensions feature (flag-gated externally).
     */
    allowHidePivotDimension?: boolean;
};

const ColumnConfiguration: FC<ColumnConfigurationProps> = ({
    fieldId,
    syncFreezeWith,
    allowHidePivotDimension = false,
}) => {
    const { pivotDimensions, visualizationConfig, resultsData } =
        useVisualizationContext();

    const [isShowTooltipVisible, setShowTooltipVisible] = useState(false);
    const [isFreezeTooltipVisible, setFreezeTooltipVisible] = useState(false);

    if (!isTableVisualizationConfig(visualizationConfig)) return null;

    const {
        updateColumnProperty,
        isColumnVisible,
        isColumnFrozen,
        getField,
        columnProperties,
    } = visualizationConfig.chartConfig;

    const field = getField(fieldId);
    const columnWidth = columnProperties[fieldId]?.width;
    const isPivotingDimension = pivotDimensions?.includes(fieldId);
    const disableHidingDimensions =
        !!(pivotDimensions && isDimension(field)) && !allowHidePivotDimension;

    // When allowHidePivotDimension is true, compute the subtotal-grouping
    // guard: hiding is forbidden for non-leaf row-index dims when subtotals
    // are enabled (hiding them would corrupt the subtotal grouping).
    const showSubtotals =
        isTableVisualizationConfig(visualizationConfig) &&
        (visualizationConfig.chartConfig.showSubtotals ?? false);
    const dimensions = resultsData?.metricQuery?.dimensions ?? [];
    const rowDims = dimensions.filter((d) => !pivotDimensions?.includes(d));
    const isSubtotalGroupingLevel =
        allowHidePivotDimension &&
        showSubtotals &&
        rowDims.includes(fieldId) &&
        rowDims.indexOf(fieldId) < rowDims.length - 1;

    // Pivoted dimensions become column headers and can't be frozen.
    const shouldShowFreezeToggle = !isPivotingDimension;

    // When syncFreezeWith is set, the lock visually reflects "any sibling
    // frozen" and clicking flips the entire group in lockstep.

    const isFrozenForDisplay = syncFreezeWith
        ? syncFreezeWith.some((id) => isColumnFrozen(id))
        : isColumnFrozen(fieldId);
    const handleFreezeToggle = () => {
        const next = !isFrozenForDisplay;
        if (syncFreezeWith) {
            syncFreezeWith.forEach((id) =>
                updateColumnProperty(id, { frozen: next }),
            );
        } else {
            updateColumnProperty(fieldId, { frozen: next });
        }
    };

    return (
        <Group gap="xs" wrap="nowrap" style={{ flexGrow: 1 }}>
            <Box style={{ flexGrow: 1 }}>
                <ColumnConfigurationInput
                    fieldId={fieldId}
                    chartConfig={visualizationConfig.chartConfig}
                    disableHidingDimensions={disableHidingDimensions}
                />
            </Box>

            <Tooltip
                position="top"
                opened={isShowTooltipVisible}
                withinPortal
                label={
                    isSubtotalGroupingLevel
                        ? "Cannot hide while it's a subtotal grouping level"
                        : isPivotingDimension && !allowHidePivotDimension
                          ? 'Cannot hide dimensions when pivoting'
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
                            isSubtotalGroupingLevel ||
                            (isPivotingDimension && !allowHidePivotDimension)
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
                            if (
                                !disableHidingDimensions &&
                                !isSubtotalGroupingLevel
                            ) {
                                updateColumnProperty(fieldId, {
                                    visible: !isColumnVisible(fieldId),
                                });
                            }
                        }}
                    >
                        <MantineIcon
                            icon={
                                isColumnVisible(fieldId) ? IconEye : IconEyeOff
                            }
                        />
                    </ActionIcon>
                </Box>
            </Tooltip>

            {shouldShowFreezeToggle ? (
                <Tooltip
                    position="top"
                    withinPortal
                    opened={isFreezeTooltipVisible}
                    label={
                        isFrozenForDisplay ? 'Unfreeze column' : 'Freeze column'
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
                                handleFreezeToggle();
                            }}
                        >
                            <MantineIcon
                                icon={
                                    isFrozenForDisplay ? IconLock : IconLockOpen
                                }
                            />
                        </ActionIcon>
                    </Box>
                </Tooltip>
            ) : null}

            {columnWidth !== undefined ? (
                <Tooltip
                    position="top"
                    withinPortal
                    label="Reset column width to auto"
                >
                    <Group
                        gap={2}
                        wrap="nowrap"
                        className={styles.widthBadge}
                        bg="ldGray.1"
                        px={4}
                        py={2}
                        onClick={() => {
                            updateColumnProperty(fieldId, {
                                width: undefined,
                            });
                        }}
                    >
                        <Text size="xs" c="dimmed">
                            {Math.round(columnWidth)}px
                        </Text>
                        <ActionIcon size="xs" variant="transparent">
                            <IconX size={12} />
                        </ActionIcon>
                    </Group>
                </Tooltip>
            ) : null}
        </Group>
    );
};

export default ColumnConfiguration;
