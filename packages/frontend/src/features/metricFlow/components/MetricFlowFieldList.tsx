import { friendlyName } from '@lightdash/common';
import { ActionIcon, Box, Group, Menu, NavLink, Text } from '@mantine/core';
import { IconAdjustments, IconCheck } from '@tabler/icons-react';
import React, { FC } from 'react';
import {
    GetMetricFlowFieldsResponse,
    MetricFlowDimensionType,
    TimeGranularity,
} from '../../../api/MetricFlowAPI';
import { convertDimensionNameToLabels } from '../utils/convertDimensionNameToLabels';
import MetricFlowFieldIcon from './MetricFlowFieldIcon';

type Props = {
    disabled: boolean;
    fields:
        | GetMetricFlowFieldsResponse['dimensions']
        | GetMetricFlowFieldsResponse['metricsForDimensions']
        | undefined;
    selectedFields: Record<string, { grain?: TimeGranularity }>;
    onClick: (fieldName: string) => void;
    onClickTimeGranularity?: (
        fieldName: string,
        timeGranularity: TimeGranularity,
    ) => void;
};

const MetricFlowFieldList: FC<Props> = ({
    disabled,
    fields,
    selectedFields,
    onClick,
    onClickTimeGranularity,
}) => {
    return (
        <>
            {fields?.map((field) => {
                const labels = convertDimensionNameToLabels(field.name);
                const isSelected: boolean = !!selectedFields[field.name];
                const selectedTimeGranularity =
                    selectedFields[field.name]?.grain ?? TimeGranularity.DAY;
                return (
                    <NavLink
                        key={field.name}
                        active={isSelected}
                        icon={
                            <MetricFlowFieldIcon type={field.type} size="lg" />
                        }
                        label={
                            <Group spacing="xxs">
                                {labels.tableLabel ? (
                                    <Text fw={400} color="gray.6">
                                        {labels.tableLabel}
                                    </Text>
                                ) : null}
                                {labels.dimensionLabel}
                            </Group>
                        }
                        disabled={disabled}
                        description={field.description}
                        rightSection={
                            isSelected &&
                            field.type === MetricFlowDimensionType.TIME &&
                            onClickTimeGranularity ? (
                                <Box onClick={(e) => e.stopPropagation()}>
                                    <Menu
                                        shadow="lg"
                                        position="bottom-start"
                                        withinPortal
                                    >
                                        <Menu.Target>
                                            <Box>
                                                <ActionIcon size="xs">
                                                    <IconAdjustments />
                                                </ActionIcon>
                                            </Box>
                                        </Menu.Target>

                                        <Menu.Dropdown>
                                            <Menu.Label>
                                                Time granularity
                                            </Menu.Label>
                                            {field.queryableGranularities.map(
                                                (timeGranularity) => (
                                                    <Menu.Item
                                                        key={timeGranularity}
                                                        rightSection={
                                                            selectedTimeGranularity ===
                                                            timeGranularity ? (
                                                                <IconCheck
                                                                    size={18}
                                                                />
                                                            ) : null
                                                        }
                                                        onClick={() =>
                                                            onClickTimeGranularity(
                                                                field.name,
                                                                timeGranularity,
                                                            )
                                                        }
                                                    >
                                                        {friendlyName(
                                                            timeGranularity,
                                                        )}
                                                    </Menu.Item>
                                                ),
                                            )}
                                        </Menu.Dropdown>
                                    </Menu>
                                </Box>
                            ) : null
                        }
                        onClick={() => onClick(field.name)}
                    />
                );
            })}
        </>
    );
};

export default MetricFlowFieldList;
