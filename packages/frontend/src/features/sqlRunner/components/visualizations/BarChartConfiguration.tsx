import {
    DEFAULT_AGGREGATION,
    DimensionType,
    type SqlTransformBarChartConfig,
    type XLayoutOptions,
    type YLayoutOptions,
} from '@lightdash/common';
import { Badge, Box, Button, Group, Select, Stack } from '@mantine/core';
import debounce from 'lodash/debounce';
import { useState, type FC } from 'react';
import { Config } from '../../../../components/VisualizationConfigs/common/Config';
import { EditableText } from '../../../../components/VisualizationConfigs/common/EditableText';
import {
    setSeriesLabel,
    setXAxisLabel,
    setXAxisReference,
    setYAxisAggregation,
    setYAxisLabel,
    setYAxisReference,
} from '../../store/barChartSlice';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { TableFieldIcon } from '../TableFields';
import { BarChartAggregationConfig } from './BarChartAggregationConfig';

const DEBOUNCE_TIME = 500;

type Axes = SqlTransformBarChartConfig;

// TODO: add y field feature
// const YFieldAxisConfigForm: FC<{
//     fieldId: string;
//     yAxisFields: Axes['y'];
//     yLayoutOptions: YLayoutOptions[];
//     setIsCreating: React.Dispatch<React.SetStateAction<boolean>>;
// }> = ({ fieldId, yLayoutOptions, setIsCreating }) => {
//     const [label, setLabel] = useState(fieldId);

//     return (
//         <Stack
//             spacing="xs"
//             sx={(theme) => ({
//                 border: `1px solid ${theme.colors.gray[0]}`,
//                 borderRadius: theme.radius.md,
//                 padding: theme.spacing.xs,
//                 marginTop: theme.spacing.xs,
//                 backgroundColor: theme.colors.gray[0],
//             })}
//         >
//             <Config.Group>
//                 <Config.Heading>Add Y field</Config.Heading>
//                 <ActionIcon
//                     size="sm"
//                     onClick={() => setIsCreating((prev) => !prev)}
//                 >
//                     <MantineIcon icon={IconTrash} />
//                 </ActionIcon>
//             </Config.Group>
//             <Group noWrap spacing="xs">
//                 <Config>
//                     <Config.Label>Label</Config.Label>
//                     <TextInput
//                         value={label}
//                         onChange={(e) => setLabel(e.currentTarget.value)}
//                         placeholder="Enter label"
//                     />
//                 </Config>
//                 <Config>
//                     <Config.Label>Field</Config.Label>
//                     <Select
//                         sx={{
//                             flexGrow: 1,
//                         }}
//                         disabled={!yLayoutOptions.length}
//                         data={yLayoutOptions.map(({ reference }) => ({
//                             value: reference,
//                             label: reference,
//                         }))}
//                         value={fieldId}
//                     />
//                 </Config>
//             </Group>
//             <BarChartAggregationConfig
//                 options={
//                     yLayoutOptions.find(
//                         ({ reference }) => reference === fieldId,
//                     )?.aggregationOptions
//                 }
//                 aggregation={
//                     yLayoutOptions.find(
//                         ({ reference }) => reference === fieldId,
//                     )?.aggregationOptions[0]
//                 }
//                 onChangeAggregation={() => {
//                     // setYAxisFields([
//                     //     ...yAxisFields,
//                     //     {
//                     //         reference: fieldId,
//                     //         label: label,
//                     //         position: 'left',
//                     //         aggregation: value,
//                     //     },
//                     // ]);
//                 }}
//             />
//             <Button
//                 sx={{
//                     alignSelf: 'flex-end',
//                 }}
//                 color="dark"
//                 size="xs"
//                 onClick={() => {
//                     addYField([
//                         ...yAxisFields,
//                         {
//                             reference: fieldId,
//                             label: label,
//                             position: 'left',
//                         },
//                     ]);
//                 }}
//             >
//                 Save
//             </Button>
//         </Stack>
//     );
// };

const YFieldsAxisConfig: FC<{
    field: Axes['y'][number];
    index: number;
    yLayoutOptions: YLayoutOptions[];
}> = ({ field, index, yLayoutOptions }) => {
    const dispatch = useAppDispatch();
    const fieldLabel = useAppSelector(
        (state) => state.barChartConfig.config?.display?.yAxis?.[index]?.label,
    );
    const onYAxisLabelChange = debounce((label: string) => {
        dispatch(setYAxisLabel({ label, index }));
    }, DEBOUNCE_TIME);
    const sqlColumns = useAppSelector((state) => state.sqlRunner.sqlColumns);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);

    return (
        <Box
            sx={(theme) => ({
                backgroundColor: theme.colors.gray[0],
                border: `1px solid ${theme.colors.gray[3]}`,
                borderRadius: theme.radius.md,
            })}
        >
            <Box pos={'relative'}>
                <EditableText
                    defaultValue={fieldLabel || field.reference}
                    readOnly={!isSettingsOpen}
                    onChange={(e) => onYAxisLabelChange(e.target.value)}
                    onClick={() =>
                        !isSettingsOpen && setIsSettingsOpen(!isSettingsOpen)
                    }
                    icon={
                        <TableFieldIcon
                            fieldType={
                                sqlColumns?.find(
                                    (y) => y.reference === field.reference,
                                )?.type ?? DimensionType.STRING
                            }
                        />
                    }
                />
                <Badge
                    pos={'absolute'}
                    radius="xs"
                    color="indigo.4"
                    size="xs"
                    variant="light"
                    right={28}
                    top={8}
                >
                    {field.aggregation ?? 'None'}
                </Badge>
            </Box>

            {isSettingsOpen && (
                <Stack spacing="xs" p="xs">
                    <Config>
                        <Config.Label>Select Y axis</Config.Label>
                        <Select
                            data={yLayoutOptions.map((y) => ({
                                value: y.reference,
                                label: y.reference,
                            }))}
                            value={field.reference}
                            placeholder="Select Y axis"
                            onChange={(value) => {
                                if (!value) return;
                                dispatch(
                                    setYAxisReference({
                                        previousReference: field.reference,
                                        reference: value,
                                        aggregation:
                                            yLayoutOptions.find(
                                                (option) =>
                                                    option.reference === value,
                                            )?.aggregationOptions[0] ??
                                            DEFAULT_AGGREGATION,
                                    }),
                                );
                            }}
                            icon={
                                <TableFieldIcon
                                    fieldType={
                                        sqlColumns?.find(
                                            (x) =>
                                                x.reference === field.reference,
                                        )?.type ?? DimensionType.STRING
                                    }
                                />
                            }
                        />
                    </Config>

                    <BarChartAggregationConfig
                        options={
                            yLayoutOptions.find(
                                (layout) =>
                                    layout.reference === field.reference,
                            )?.aggregationOptions
                        }
                        aggregation={field.aggregation}
                        onChangeAggregation={(value) =>
                            dispatch(
                                setYAxisAggregation({
                                    reference: field.reference,
                                    aggregation: value,
                                }),
                            )
                        }
                    />

                    <Group mt="xs" spacing="xs" position="right">
                        <Button
                            color="dark"
                            size="xs"
                            compact
                            onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                        >
                            Confirm
                        </Button>
                    </Group>
                </Stack>
            )}
        </Box>
    );
};

const XFieldAxisConfig = ({
    field,
    xLayoutOptions,
}: {
    field: Axes['x'];
    xLayoutOptions: XLayoutOptions[];
}) => {
    const dispatch = useAppDispatch();
    const fieldLabel = useAppSelector(
        (state) => state.barChartConfig.config?.display?.xAxis?.label,
    );
    const fieldType = useAppSelector(
        (state) => state.barChartConfig.config?.display?.xAxis?.type,
    );
    const sqlColumns = useAppSelector((state) => state.sqlRunner.sqlColumns);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);

    const onXAxisLabelChange = debounce((label: string) => {
        if (!fieldType) return;
        dispatch(setXAxisLabel({ label, type: fieldType }));
    }, DEBOUNCE_TIME);

    return (
        <Box
            sx={(theme) => ({
                backgroundColor: theme.colors.gray[0],
                border: `1px solid ${theme.colors.gray[3]}`,
                borderRadius: theme.radius.md,
            })}
        >
            <EditableText
                defaultValue={fieldLabel || field.reference}
                readOnly={!isSettingsOpen}
                onChange={(e) => onXAxisLabelChange(e.target.value)}
                onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                icon={
                    <TableFieldIcon
                        fieldType={
                            sqlColumns?.find(
                                (x) => x.reference === field.reference,
                            )?.type ?? DimensionType.STRING
                        }
                    />
                }
            />

            {isSettingsOpen && (
                <Stack spacing="xs" p="xs">
                    <Config>
                        <Config.Label>Select X axis</Config.Label>
                        <Select
                            data={xLayoutOptions.map((x) => ({
                                value: x.reference,
                                label: x.reference,
                            }))}
                            value={field.reference}
                            placeholder="Select X axis"
                            onChange={(value) => {
                                if (!value) return;
                                dispatch(setXAxisReference(value));
                            }}
                            icon={
                                <TableFieldIcon
                                    fieldType={
                                        sqlColumns?.find(
                                            (x) =>
                                                x.reference === field.reference,
                                        )?.type ?? DimensionType.STRING
                                    }
                                />
                            }
                        />
                    </Config>

                    <Group mt="xs" spacing="xs" position="right">
                        <Button
                            color="dark"
                            size="xs"
                            compact
                            onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                        >
                            Confirm
                        </Button>
                    </Group>
                </Stack>
            )}
        </Box>
    );
};

export const BarChartConfig = () => {
    const dispatch = useAppDispatch();
    const xLayoutOptions = useAppSelector(
        (state) => state.barChartConfig.options.xLayoutOptions,
    );
    const yLayoutOptions = useAppSelector(
        (state) => state.barChartConfig.options.yLayoutOptions,
    );

    const xAxisField = useAppSelector(
        (state) => state.barChartConfig.config?.fieldConfig?.x,
    );
    const yAxisFields = useAppSelector(
        (state) => state.barChartConfig.config?.fieldConfig?.y,
    );

    const series = useAppSelector(
        (state) => state.barChartConfig.config?.display?.series,
    );

    const onSeriesLabelChange = debounce((reference: string, label: string) => {
        dispatch(setSeriesLabel({ reference, label }));
    }, DEBOUNCE_TIME);

    return (
        <Stack spacing="xs">
            <Config>
                <Config.Section>
                    <Config.Heading>{`X-axis`}</Config.Heading>
                    {xAxisField && xLayoutOptions && (
                        <XFieldAxisConfig
                            field={xAxisField}
                            xLayoutOptions={xLayoutOptions}
                        />
                    )}
                </Config.Section>
            </Config>
            <Config>
                <Config.Section>
                    <Config.Heading>{`Y-axis`}</Config.Heading>

                    {yLayoutOptions &&
                        yAxisFields &&
                        yAxisFields.map((field, index) => (
                            <YFieldsAxisConfig
                                key={field.reference}
                                index={index}
                                field={field}
                                yLayoutOptions={yLayoutOptions}
                            />
                        ))}
                </Config.Section>
            </Config>
            <Config>
                <Config.Heading>Series</Config.Heading>

                {series &&
                    Object.entries(series).map(([reference, { label }]) => (
                        <EditableText
                            key={reference}
                            defaultValue={label ?? reference}
                            onChange={(e) =>
                                onSeriesLabelChange(reference, e.target.value)
                            }
                        />
                    ))}
            </Config>
        </Stack>
    );
};
