import { type VizColumn } from '@lightdash/common';
import {
    ActionIcon,
    MultiSelect,
    ScrollArea,
    Switch,
    TextInput,
} from '@mantine/core';
import { IconEye, IconEyeOff } from '@tabler/icons-react';
import { useMemo, type FC } from 'react';
import {
    useAppDispatch as useVizDispatch,
    useAppSelector as useVizSelector,
} from '../../../features/sqlRunner/store/hooks';
import { Config } from '../../VisualizationConfigs/common/Config';
import MantineIcon from '../../common/MantineIcon';
import { TableFieldIcon } from '../Icons';
import {
    updateColumnVisibility,
    updateDisplay,
    updateFieldLabel,
} from '../store/tableVisSlice';

const TableVisConfiguration: FC<{ columns: VizColumn[] }> = ({ columns }) => {
    const dispatch = useVizDispatch();

    const columnsConfig = useVizSelector(
        (state) => state.tableVisConfig.columns,
    );
    const display = useVizSelector((state) => state.tableVisConfig.display);

    // Get visible columns for merge column selection
    const visibleColumnOptions = useMemo(() => {
        if (!columnsConfig) return [];
        return Object.keys(columnsConfig)
            .filter((ref) => columnsConfig[ref].visible)
            .map((ref) => ({
                value: ref,
                label: columnsConfig[ref].label,
            }));
    }, [columnsConfig]);

    if (!columnsConfig) {
        return null;
    }

    return (
        <ScrollArea
            offsetScrollbars
            variant="primary"
            className="only-vertical"
            type="auto"
            sx={{ flex: 1 }}
            mb="md"
        >
            <Config>
                <Config.Section>
                    <Config.Heading>Display</Config.Heading>

                    <Switch
                        label="Merge consecutive duplicate values"
                        description="Visually merge cells with consecutive duplicate values in selected columns"
                        checked={display?.mergeConsecutiveDuplicates ?? false}
                        onChange={(e) =>
                            dispatch(
                                updateDisplay({
                                    mergeConsecutiveDuplicates:
                                        e.currentTarget.checked,
                                }),
                            )
                        }
                    />

                    {display?.mergeConsecutiveDuplicates && (
                        <MultiSelect
                            label="Columns to merge"
                            description="Select which columns should have consecutive duplicates merged"
                            placeholder="Select columns..."
                            data={visibleColumnOptions}
                            value={display?.mergeColumns ?? []}
                            onChange={(value) =>
                                dispatch(
                                    updateDisplay({
                                        mergeColumns: value,
                                    }),
                                )
                            }
                            searchable
                            clearable
                        />
                    )}
                </Config.Section>

                <Config.Section>
                    <Config.Heading>Column labels</Config.Heading>

                    {Object.keys(columnsConfig).map((reference) => {
                        const fieldType = columns?.find(
                            (c) => c.reference === reference,
                        )?.type;

                        return (
                            <TextInput
                                key={reference}
                                radius="md"
                                value={columnsConfig[reference].label}
                                icon={
                                    fieldType && (
                                        <TableFieldIcon fieldType={fieldType} />
                                    )
                                }
                                readOnly={!columnsConfig[reference].visible}
                                rightSection={
                                    <ActionIcon
                                        onClick={() =>
                                            dispatch(
                                                updateColumnVisibility({
                                                    reference,
                                                    visible:
                                                        !columnsConfig[
                                                            reference
                                                        ].visible,
                                                }),
                                            )
                                        }
                                    >
                                        <MantineIcon
                                            icon={
                                                columnsConfig[reference].visible
                                                    ? IconEye
                                                    : IconEyeOff
                                            }
                                        />
                                    </ActionIcon>
                                }
                                onChange={(e) => {
                                    dispatch(
                                        updateFieldLabel({
                                            reference,
                                            label: e.target.value,
                                        }),
                                    );
                                }}
                                styles={(theme) => ({
                                    input: {
                                        backgroundColor: !columnsConfig[
                                            reference
                                        ].visible
                                            ? theme.colors.gray[1]
                                            : '',
                                        cursor: !columnsConfig[reference]
                                            .visible
                                            ? 'not-allowed'
                                            : 'text',
                                    },
                                })}
                            />
                        );
                    })}
                </Config.Section>
            </Config>
        </ScrollArea>
    );
};

export default TableVisConfiguration;
