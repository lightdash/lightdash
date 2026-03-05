import {
    DashboardFilterValidationErrorType,
    friendlyName,
    isChartValidationError,
    isDashboardValidationError,
    isTableValidationError,
    ValidationErrorType,
    type ValidationResponse,
} from '@lightdash/common';
import { Mark, Stack, Text } from '@mantine-8/core';
import { type FC } from 'react';
import classes from './ErrorMessage.module.css';

const CustomMark: FC<React.PropsWithChildren<{}>> = ({ children }) => (
    <Mark color="gray" px={2} fw={500} fz={11} className={classes.mark}>
        {children}
    </Mark>
);

const ErrorMessageByType: FC<{
    validationError: ValidationResponse;
}> = ({ validationError }) => {
    if (isChartValidationError(validationError)) {
        // Handle chart configuration errors (unused dimensions)
        if (
            validationError.errorType === ValidationErrorType.ChartConfiguration
        ) {
            return (
                <Text fz={11}>
                    <CustomMark>{validationError.fieldName}</CustomMark>
                    {': '}
                    {validationError.error}
                </Text>
            );
        }
        return (
            <Text fz={11}>
                <CustomMark>{validationError.fieldName}</CustomMark> no longer
                exists
            </Text>
        );
    }

    if (isDashboardValidationError(validationError)) {
        // Handle dashboard filter errors with typed error types
        if (validationError.dashboardFilterErrorType) {
            switch (validationError.dashboardFilterErrorType) {
                case DashboardFilterValidationErrorType.TableNotUsedByAnyChart:
                    return (
                        <Text fz={11}>
                            <CustomMark>{validationError.fieldName}</CustomMark>{' '}
                            references table{' '}
                            <CustomMark>{validationError.tableName}</CustomMark>{' '}
                            which is not used by any chart on this dashboard
                        </Text>
                    );
                case DashboardFilterValidationErrorType.FieldDoesNotExist:
                    return (
                        <Text fz={11}>
                            <CustomMark>{validationError.fieldName}</CustomMark>{' '}
                            no longer exists
                        </Text>
                    );
                case DashboardFilterValidationErrorType.TableDoesNotExist:
                    return (
                        <Text fz={11}>
                            Table{' '}
                            <CustomMark>{validationError.tableName}</CustomMark>{' '}
                            no longer exists
                        </Text>
                    );
                default:
                    return <Text fz={11}>{validationError.error}</Text>;
            }
        }

        // Handle broken chart errors
        if (validationError.chartName) {
            return (
                <Text fz={11}>
                    <CustomMark>{validationError.chartName}</CustomMark> is
                    broken
                </Text>
            );
        }

        // Fallback for unexpected cases
        return <Text fz={11}>{validationError.error}</Text>;
    }

    if (isTableValidationError(validationError) && validationError) {
        return <Text fz={11}>{validationError.error}</Text>;
    }

    return null;
};

export const ErrorMessage: FC<{ validationError: ValidationResponse }> = ({
    validationError,
}) => {
    const isWarning =
        isChartValidationError(validationError) &&
        validationError.errorType === ValidationErrorType.ChartConfiguration;

    return (
        <Stack gap={4}>
            <Text fw={600} c={isWarning ? 'orange.6' : 'red.6'} fz={10}>
                {validationError.errorType
                    ? friendlyName(validationError.errorType)
                    : ''}{' '}
                {isWarning ? 'warning' : 'error'}
            </Text>
            <ErrorMessageByType validationError={validationError} />
        </Stack>
    );
};
