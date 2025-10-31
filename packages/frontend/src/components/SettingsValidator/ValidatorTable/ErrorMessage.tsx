import {
    DashboardFilterValidationErrorType,
    friendlyName,
    isChartValidationError,
    isDashboardValidationError,
    isTableValidationError,
    type ValidationResponse,
} from '@lightdash/common';
import { Mark, Stack, Text } from '@mantine/core';
import { type FC } from 'react';

const CustomMark: FC<React.PropsWithChildren<{}>> = ({ children }) => (
    <Mark
        color="gray"
        px={2}
        fw={500}
        fz="xs"
        sx={{
            textTransform: 'none',
            borderRadius: '2px',
        }}
    >
        {children}
    </Mark>
);

const ErrorMessageByType: FC<{
    validationError: ValidationResponse;
}> = ({ validationError }) => {
    if (isChartValidationError(validationError)) {
        return (
            <Text>
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
                        <Text>
                            <CustomMark>{validationError.fieldName}</CustomMark>{' '}
                            references table{' '}
                            <CustomMark>{validationError.tableName}</CustomMark>{' '}
                            which is not used by any chart on this dashboard
                        </Text>
                    );
                case DashboardFilterValidationErrorType.FieldDoesNotExist:
                    return (
                        <Text>
                            <CustomMark>{validationError.fieldName}</CustomMark>{' '}
                            no longer exists
                        </Text>
                    );
                case DashboardFilterValidationErrorType.TableDoesNotExist:
                    return (
                        <Text>
                            Table{' '}
                            <CustomMark>{validationError.tableName}</CustomMark>{' '}
                            no longer exists
                        </Text>
                    );
                default:
                    return <Text>{validationError.error}</Text>;
            }
        }

        // Handle broken chart errors
        if (validationError.chartName) {
            return (
                <Text>
                    <CustomMark>{validationError.chartName}</CustomMark> is
                    broken
                </Text>
            );
        }

        // Fallback for unexpected cases
        return <Text>{validationError.error}</Text>;
    }

    if (isTableValidationError(validationError) && validationError) {
        return <Text>{validationError.error}</Text>;
    }

    return null;
};

export const ErrorMessage: FC<{ validationError: ValidationResponse }> = ({
    validationError,
}) => {
    return (
        <Stack spacing={4}>
            <Text fw={600} color="red.6" fz={11}>
                {validationError.errorType
                    ? friendlyName(validationError.errorType)
                    : ''}{' '}
                error
            </Text>
            <ErrorMessageByType validationError={validationError} />
        </Stack>
    );
};
