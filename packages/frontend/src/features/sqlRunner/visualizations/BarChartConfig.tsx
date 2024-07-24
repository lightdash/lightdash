import { DimensionType, type Axes } from '@lightdash/common';
import {
    ActionIcon,
    Badge,
    Box,
    Button,
    Group,
    Select,
    Stack,
    TextInput,
} from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import React, { useState, type FC } from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';
import { Config } from '../../../../components/VisualizationConfigs/common/Config';
import { EditableText } from '../../../../components/VisualizationConfigs/common/EditableText';
import { type XLayoutOptions, type YLayoutOptions } from '../../config';
import { useAppSelector } from '../../store/hooks';
import { TableFieldIcon } from '../TableFields';
import { BarChartAggregationConfig } from './BarChartAggregationConfig';

const YFieldAxisConfigForm: FC<{
    fieldId: string;
    yAxisFields: Axes['y'];
    setYAxisFields: React.Dispatch<React.SetStateAction<Axes['y'] | undefined>>;
    yLayoutOptions: YLayoutOptions[];
    setIsCreating: React.Dispatch<React.SetStateAction<boolean>>;
}> = ({
    fieldId,
    yAxisFields,
    setYAxisFields,
    yLayoutOptions,
    setIsCreating,
}) => {
    return (
        <Stack
            spacing="xs"
            sx={(theme) => ({
                border: `1px solid ${theme.colors.gray[0]}`,
                borderRadius: theme.radius.md,
                padding: theme.spacing.xs,
                marginTop: theme.spacing.xs,
                backgroundColor: theme.colors.gray[0],
            })}
        >
            <Config.Group>
                <Config.Heading>Add Y field</Config.Heading>
                <ActionIcon
                    size="sm"
                    onClick={() => setIsCreating((prev) => !prev)}
                >
                    <MantineIcon icon={IconTrash} />
                </ActionIcon>
            </Config.Group>
            <Group noWrap spacing="xs">
                <Config>
                    <Config.Label>Label</Config.Label>
                    <TextInput
                        value={fieldId}
                        // onChange={(e) => setLabel(e.currentTarget.value)}
                        placeholder="Enter label"
                    />
                </Config>
                <Config>
                    <Config.Label>Field</Config.Label>
                    <Select
                        sx={{
                            flexGrow: 1,
                        }}
                        disabled={!yLayoutOptions.length}
                        data={yLayoutOptions.map(({ columnId }) => ({
                            value: columnId,
                            label: columnId,
                        }))}
                        value={fieldId}
                        onChange={(value) =>
                            !!value &&
                            setYAxisFields([
                                ...yAxisFields,
                                {
                                    // TODO: this is wrong
                                    reference: value,
                                    label: value,
                                    position: 'left',
                                },
                            ])
                        }
                    />
                </Config>
            </Group>
            <BarChartAggregationConfig
                options={
                    yLayoutOptions.find(({ columnId }) => columnId === fieldId)
                        ?.aggregationOptions
                }
            />
            <Button
                sx={{
                    alignSelf: 'flex-end',
                }}
                color="dark"
                size="xs"
            >
                Save
            </Button>
        </Stack>
    );
};

const YFieldsAxisConfig: FC<{
    field: Axes['y'][number];
    setYAxisFields: (value: Axes['y']) => void;
    yLayoutOptions: YLayoutOptions[];
}> = ({ field, yLayoutOptions }) => {
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
                    value={field.label}
                    readOnly={!isSettingsOpen}
                    onChange={(e) => console.log(e.target.value)}
                    onSubmit={(value) => console.log(value)}
                    onClick={() => setIsSettingsOpen(!isSettingsOpen)}
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
                                value: y.columnId,
                                label: y.columnId,
                            }))}
                            value={field.reference}
                            clearable
                            placeholder="Select Y axis"
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
                                (layout) => layout.columnId === field.reference,
                            )?.aggregationOptions
                        }
                    />

                    <Group mt="xs" spacing="xs" position="right">
                        <Button
                            size="xs"
                            variant="default"
                            compact
                            onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                        >
                            Cancel
                        </Button>
                        <Button color="dark" size="xs" compact>
                            Save
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
            <EditableText
                value={field.label}
                readOnly={!isSettingsOpen}
                onChange={(e) => console.log(e.target.value)}
                onSubmit={(value) => console.log(value)}
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
                            clearable
                            placeholder="Select X axis"
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
                            size="xs"
                            variant="default"
                            compact
                            onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                        >
                            Cancel
                        </Button>
                        <Button color="dark" size="xs" compact>
                            Save
                        </Button>
                    </Group>
                </Stack>
            )}
        </Box>
    );
};

export const BarChartConfig = () => {
    const xLayoutOptions = useAppSelector(
        (state) => state.sqlRunner.barChartConfigOptions?.xAxisOptions,
    );
    const yLayoutOptions = useAppSelector(
        (state) => state.sqlRunner.barChartConfigOptions?.yAxisOptions,
    );

    const barChartConfig = useAppSelector(
        (state) => state.sqlRunner.barChartConfig,
    );

    const [xAxisField] = useState<Axes['x'] | undefined>(
        barChartConfig?.axes?.x,
    );
    const [yAxisFields, setYAxisFields] = useState<Axes['y'] | undefined>(
        barChartConfig?.axes?.y,
    );

    const [isCreating, setIsCreating] = useState(true);

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
                        yAxisFields.map((field) => (
                            <YFieldsAxisConfig
                                key={field.reference}
                                field={field}
                                setYAxisFields={setYAxisFields}
                                yLayoutOptions={yLayoutOptions}
                            />
                        ))}

                    {yLayoutOptions && yAxisFields && isCreating ? (
                        <YFieldAxisConfigForm
                            fieldId={yLayoutOptions[0].columnId}
                            yAxisFields={yAxisFields}
                            setYAxisFields={setYAxisFields}
                            yLayoutOptions={yLayoutOptions}
                            setIsCreating={setIsCreating}
                        />
                    ) : (
                        <Button
                            size="xs"
                            sx={{
                                alignSelf: 'flex-end',
                            }}
                            color="gray.6"
                            variant="outline"
                            compact
                            onClick={() => setIsCreating(!isCreating)}
                        >
                            + Add
                        </Button>
                    )}
                </Config.Section>
            </Config>
        </Stack>
    );
};
