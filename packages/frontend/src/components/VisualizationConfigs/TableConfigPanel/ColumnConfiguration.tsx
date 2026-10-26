import {
    getTableFieldLabelDefault,
    isTableColumnFrozen,
    isTableColumnVisible,
} from '@lightdash/visualization/editor';
import {
    ActionIcon,
    Box,
    Group,
    Text,
    TextInput,
    Tooltip,
} from '@mantine/core';
import { useDebouncedCallback } from '@mantine/hooks';
import {
    IconEye,
    IconEyeOff,
    IconLock,
    IconLockOpen,
    IconX,
} from '@tabler/icons-react';
import { useState, type FC } from 'react';
import {
    selectTableColumnProperties,
    selectTableShowSubtotals,
    selectTableShowTableNames,
} from '../../../features/visualization/store';
import { useTableEditorActions } from '../../../hooks/tableVisualization/useTableConfig';
import {
    getRowDims,
    isFieldSubtotalGroupingLevel,
} from '../../../utils/pivotSubtotalGrouping';
import MantineIcon from '../../common/MantineIcon';
import {
    useVisualizationInputs,
    useVisualizationInputSelector,
} from '../../LightdashVisualization/useVisualizationContext';
import styles from './ColumnConfiguration.module.css';

type ColumnConfigurationInputProps = {
    fieldId: string;
    labelOverride: string | undefined;
    isVisible: boolean;
};

const ColumnConfigurationInput: FC<ColumnConfigurationInputProps> = ({
    fieldId,
    labelOverride,
    isVisible,
}) => {
    const { itemsMap } = useVisualizationInputs();
    const showTableNames = useVisualizationInputSelector(
        selectTableShowTableNames,
    );
    const { updateColumnProperty } = useTableEditorActions();
    const labelDefault = getTableFieldLabelDefault(
        itemsMap,
        showTableNames,
        fieldId,
    );
    const [draft, setDraft] = useState(labelOverride ?? labelDefault ?? '');
    const commitLabel = useDebouncedCallback(
        (name: string) => updateColumnProperty(fieldId, { name }),
        { delay: 500, flushOnUnmount: true },
    );

    return (
        <TextInput
            size="xs"
            disabled={!isVisible}
            placeholder={labelDefault}
            value={draft}
            onChange={(e) => {
                setDraft(e.currentTarget.value);
                commitLabel(e.currentTarget.value);
            }}
        />
    );
};

export type ColumnConfigurationProps = {
    fieldId: string;

    /**
     * When provided, the freeze toggle controls all listed fieldIds together.
     */
    syncFreezeWith?: string[];

    /**
     * Hides the freeze toggle for fields that can't be meaningfully frozen,
     * e.g. metrics in a pivoted table with metrics as columns.
     */
    hideFreezeToggle?: boolean;
};

const ColumnConfiguration: FC<ColumnConfigurationProps> = ({
    fieldId,
    syncFreezeWith,
    hideFreezeToggle = false,
}) => {
    const { pivotDimensions, resultsData } = useVisualizationInputs();
    const columnProperties = useVisualizationInputSelector(
        selectTableColumnProperties,
    );
    const showSubtotals = useVisualizationInputSelector(
        selectTableShowSubtotals,
    );
    const { updateColumnProperty } = useTableEditorActions();

    const [isShowTooltipVisible, setShowTooltipVisible] = useState(false);
    const [isFreezeTooltipVisible, setFreezeTooltipVisible] = useState(false);

    const isColumnVisible = (id: string) =>
        isTableColumnVisible(columnProperties, id);
    const isColumnFrozen = (id: string) =>
        isTableColumnFrozen(columnProperties, id);

    const columnWidth = columnProperties[fieldId]?.width;
    const isPivotingDimension = pivotDimensions?.includes(fieldId);

    // Hiding is forbidden for non-leaf row-index dims when subtotals are
    // enabled (hiding them would corrupt the subtotal grouping).
    const dimensions = resultsData?.metricQuery?.dimensions ?? [];
    const rowDims = getRowDims(dimensions, pivotDimensions);
    const isSubtotalGroupingLevel = isFieldSubtotalGroupingLevel(
        fieldId,
        rowDims,
        showSubtotals,
    );

    // Pivoted dimensions become column headers and can't be frozen.
    const shouldShowFreezeToggle = !isPivotingDimension && !hideFreezeToggle;

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
        <Group gap="xs" wrap="nowrap" flex={1}>
            <Box flex={1}>
                <ColumnConfigurationInput
                    fieldId={fieldId}
                    labelOverride={columnProperties[fieldId]?.name}
                    isVisible={isColumnVisible(fieldId)}
                />
            </Box>

            <Tooltip
                position="top"
                opened={isShowTooltipVisible}
                label={
                    isSubtotalGroupingLevel
                        ? "Cannot hide while it's a subtotal grouping level"
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
                        disabled={isSubtotalGroupingLevel}
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
                            if (!isSubtotalGroupingLevel) {
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
                <Tooltip position="top" label="Reset column width to auto">
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
