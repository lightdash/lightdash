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
// eslint-disable-next-line css-modules/no-unused-class
import classes from './ValidatorTable.module.css';

const CustomMark: FC<React.PropsWithChildren<{}>> = ({ children }) => (
    <Mark color="ldGray" px={2} fw={500} fz="xs" className={classes.customMark}>
        {children}
    </Mark>
);

const ErrorMessageByType: FC<{
    validationError: ValidationResponse;
}> = ({ validationError }) => {
    if (isChartValidationError(validationError)) {
        if (
            validationError.errorType === ValidationErrorType.ChartConfiguration
        ) {
            return (
                <Text fz="xs">
                    <CustomMark>{validationError.fieldName}</CustomMark> is
                    included in the query but not used in the chart
                    configuration (x-axis, y-axis, or group by). This can cause
                    incorrect rendering. We recommend removing unused dimensions
                    from the query.
                </Text>
            );
        }
        return (
            <Text fz="xs">
                <CustomMark>{validationError.fieldName}</CustomMark> no longer
                exists
            </Text>
        );
    }

    if (isDashboardValidationError(validationError)) {
        if (validationError.dashboardFilterErrorType) {
            switch (validationError.dashboardFilterErrorType) {
                case DashboardFilterValidationErrorType.TableNotUsedByAnyChart:
                    return (
                        <Text fz="xs">
                            <CustomMark>{validationError.fieldName}</CustomMark>{' '}
                            references table{' '}
                            <CustomMark>{validationError.tableName}</CustomMark>{' '}
                            which is not used by any chart on this dashboard
                        </Text>
                    );
                case DashboardFilterValidationErrorType.FieldDoesNotExist:
                    return (
                        <Text fz="xs">
                            <CustomMark>{validationError.fieldName}</CustomMark>{' '}
                            no longer exists
                        </Text>
                    );
                case DashboardFilterValidationErrorType.TableDoesNotExist:
                    return (
                        <Text fz="xs">
                            Table{' '}
                            <CustomMark>{validationError.tableName}</CustomMark>{' '}
                            no longer exists
                        </Text>
                    );
                default:
                    return <Text fz="xs">{validationError.error}</Text>;
            }
        }

        if (validationError.chartName) {
            return (
                <Text fz="xs">
                    <CustomMark>{validationError.chartName}</CustomMark> is
                    broken
                </Text>
            );
        }

        return <Text fz="xs">{validationError.error}</Text>;
    }

    if (isTableValidationError(validationError) && validationError) {
        return <Text fz="xs">{validationError.error}</Text>;
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
            <Text fw={600} c={isWarning ? 'orange.6' : 'red.6'} fz="xs">
                {validationError.errorType
                    ? friendlyName(validationError.errorType)
                    : ''}{' '}
                {isWarning ? 'warning' : 'error'}
            </Text>
            <ErrorMessageByType validationError={validationError} />
        </Stack>
    );
};
