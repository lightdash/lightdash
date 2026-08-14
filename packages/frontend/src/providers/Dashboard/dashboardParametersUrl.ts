import {
    type DashboardParameters,
    type ParametersValuesMap,
    type ParameterValue,
} from '@lightdash/common';
import isEqual from 'lodash/isEqual';

const isParameterValue = (value: unknown): value is ParameterValue => {
    if (typeof value === 'string') return true;
    if (typeof value === 'number') return Number.isFinite(value);
    if (!Array.isArray(value)) return false;

    return (
        value.every((item) => typeof item === 'string') ||
        value.every((item) => typeof item === 'number' && Number.isFinite(item))
    );
};

export const parseDashboardParametersUrl = (
    value: string | null,
): ParametersValuesMap | null => {
    if (value === null) return null;

    const parsed: unknown = JSON.parse(value);
    if (
        typeof parsed !== 'object' ||
        parsed === null ||
        Array.isArray(parsed) ||
        !Object.values(parsed).every(isParameterValue)
    ) {
        throw new Error('Invalid dashboard parameters URL value');
    }

    return parsed as ParametersValuesMap;
};

export const toDashboardParameters = (
    values: ParametersValuesMap,
): DashboardParameters =>
    Object.fromEntries(
        Object.entries(values).map(([key, value]) => [
            key,
            { parameterName: key, value },
        ]),
    );

export const reconcileDashboardParameters = (
    currentParameters: DashboardParameters,
    savedParameters: DashboardParameters,
    isEditMode: boolean,
): DashboardParameters =>
    isEditMode ? savedParameters : { ...savedParameters, ...currentParameters };

export const getDashboardParameterOverrides = (
    values: ParametersValuesMap,
    savedParameters: DashboardParameters,
): ParametersValuesMap =>
    Object.fromEntries(
        Object.entries(values).filter(
            ([key, value]) => !isEqual(savedParameters[key]?.value, value),
        ),
    );
