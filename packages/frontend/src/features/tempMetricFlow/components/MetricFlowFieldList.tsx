import { friendlyName } from '@lightdash/common';
import { NavLink } from '@mantine/core';
import React, { FC } from 'react';
import { GetMetricFlowFieldsResponse } from '../../../api/MetricFlowAPI';
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
            {fields?.map((field) => (
                <NavLink
                    key={field.name}
                    active={selectedFields.includes(field.name)}
                    icon={<MetricFlowFieldIcon type={field.type} size="lg" />}
                    label={friendlyName(field.name)}
                    description={field.description}
                    onClick={() => onClick(field.name)}
                />
            ))}
        </>
    );
};

export default MetricFlowFieldList;
