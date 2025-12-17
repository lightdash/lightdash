import {
    type ParameterDefinitions,
    type ParametersValuesMap,
    type ParameterValue,
} from '@lightdash/common';
import { Group, Skeleton } from '@mantine-8/core';
import { useCallback, useState, type FC } from 'react';
import { useParams } from 'react-router';
import Parameter from './Parameter';

type Props = {
    isEditMode: boolean;
    parameterValues: ParametersValuesMap;
    onParameterChange: (key: string, value: ParameterValue | null) => void;
    onClearAll: () => void;
    parameters?: ParameterDefinitions;
    missingRequiredParameters?: string[];
    pinnedParameters?: string[];
    onParameterPin?: (paramKey: string) => void;
    isLoading?: boolean;
    isError?: boolean;
};

export const Parameters: FC<Props> = ({
    isEditMode,
    parameterValues,
    onParameterChange,
    parameters,
    isLoading,
    missingRequiredParameters = [],
}) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const [openPopoverId, setOpenPopoverId] = useState<string | undefined>();

    const handlePopoverOpen = useCallback((popoverId: string) => {
        setOpenPopoverId(popoverId);
    }, []);

    const handlePopoverClose = useCallback(() => {
        setOpenPopoverId(undefined);
    }, []);

    if (!parameters || Object.keys(parameters).length === 0) {
        return null;
    }

    if (isLoading) {
        return (
            <Group gap="xs">
                <Skeleton h={30} w={120} radius={100} />
                <Skeleton h={30} w={120} radius={100} />
            </Group>
        );
    }

    return (
        <Group gap="xs">
            {Object.entries(parameters).map(([paramKey, parameter]) => (
                <Parameter
                    key={paramKey}
                    paramKey={paramKey}
                    parameter={parameter}
                    value={parameterValues[paramKey] ?? null}
                    parameterValues={parameterValues}
                    openPopoverId={openPopoverId}
                    onPopoverOpen={handlePopoverOpen}
                    onPopoverClose={handlePopoverClose}
                    onParameterChange={onParameterChange}
                    projectUuid={projectUuid}
                    isRequired={missingRequiredParameters.includes(paramKey)}
                    isEditMode={isEditMode}
                />
            ))}
        </Group>
    );
};
