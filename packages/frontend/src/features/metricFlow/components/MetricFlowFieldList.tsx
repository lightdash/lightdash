import { Group, NavLink, Text } from '@mantine/core';
import React, { FC } from 'react';
import { GetMetricFlowFieldsResponse } from '../../../api/MetricFlowAPI';
import { convertDimensionNameToLabels } from '../utils/convertDimensionNameToLabels';
import MetricFlowFieldIcon from './MetricFlowFieldIcon';

type Props = {
    fields:
        | GetMetricFlowFieldsResponse['dimensions']
        | GetMetricFlowFieldsResponse['metricsForDimensions']
        | undefined;
    selectedFields: string[];
    onClick: (fieldName: string) => void;
};

const MetricFlowFieldList: FC<Props> = ({
    fields,
    selectedFields,
    onClick,
}) => {
    return (
        <>
            {fields?.map((field) => {
                const labels = convertDimensionNameToLabels(field.name);
                return (
                    <NavLink
                        key={field.name}
                        active={selectedFields.includes(field.name)}
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
                        description={field.description}
                        onClick={() => onClick(field.name)}
                    />
                );
            })}
        </>
    );
};

export default MetricFlowFieldList;
