import { type Axes } from '@lightdash/common';
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
import { useAppSelector } from '../../store/hooks';
import {
    type XLayoutOptions,
    type YLayoutOptions,
} from '../visualizations/barChartBizLogic';
import { AggregationConfig } from './AggregationConfig';

const YFieldAxisConfigForm: FC<{
    fieldId: string;
    yAxisFields: Axes['y'];
    setYAxisFields: React.Dispatch<React.SetStateAction<Axes['y']>>;
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
            <AggregationConfig
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
                    {field.aggregation}
                </Badge>
            </Box>

            {isSettingsOpen && (
                <Stack spacing="xs" p="xs">
                    <Config>
                        <Config.Label>Select Y axis</Config.Label>
                        <Select
                            data={yLayoutOptions.map((x) => ({
                                value: x.columnId,
                                label: x.columnId,
                            }))}
                            value={field.reference}
                            clearable
                            placeholder="Select X axis"
                        />
                    </Config>

                    <AggregationConfig
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
            />

            {isSettingsOpen && (
                <Stack spacing="xs" p="xs">
                    <Config>
                        <Config.Label>Select X axis</Config.Label>
                        <Select
                            data={xLayoutOptions.map((x) => ({
                                value: x.columnId,
                                label: x.columnId,
                            }))}
                            value={field.reference}
                            clearable
                            placeholder="Select X axis"
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

    const [xAxisField] = useState<Axes['x']>(
        // TODO: default should be applied on the barChartBizLogic
        {
            // @ts-expect-error testing purposes
            reference: xLayoutOptions?.[0].columnId,
            label: xLayoutOptions?.[0].columnId,
        },
    );
    const [yAxisFields, setYAxisFields] = useState<Axes['y']>([
        // TODO: default should be applied on the barChartBizLogic
        {
            // @ts-expect-error testing purposes
            reference: yLayoutOptions?.[1].columnId,
            // TODO: can this be left empty and default to `none` in the barChartBizLogic?
            aggregation: 'none',
            // @ts-expect-error testing purposes
            label: yLayoutOptions?.[1].columnId,
            // TODO: can this be left empty and default to `left` in the barChartBizLogic?
            position: 'left',
        },
    ]);
    const [isCreating, setIsCreating] = useState(true);

    return (
        <Stack spacing="xs">
            <Config>
                <Config.Section>
                    <Config.Heading>{`X-axis`}</Config.Heading>
                    {xLayoutOptions && (
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
                        yAxisFields.map((field) => (
                            <YFieldsAxisConfig
                                key={field.reference}
                                field={field}
                                setYAxisFields={setYAxisFields}
                                yLayoutOptions={yLayoutOptions}
                            />
                        ))}

                    {yLayoutOptions && isCreating ? (
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
