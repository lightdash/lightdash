import {
    assertUnreachable,
    DashboardFilterValidationErrorType,
    isChartValidationError,
    isDataAppValidationError,
    isDashboardValidationError,
    isTableValidationError,
    ValidationErrorType,
    type ValidationResponse,
} from '@lightdash/common';
import { Mark, Stack, Text } from '@mantine/core';
import { type FC } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { getErrorTypeLabel } from '../utils/errorTypeLabel';
import classes from './ErrorMessage.module.css';

const CustomMark: FC<React.PropsWithChildren<{}>> = ({ children }) => (
    <Mark color="gray" px={2} fw={500} fz="xs" className={classes.mark}>
        {children}
    </Mark>
);

const ErrorMessageByType: FC<{
    validationError: ValidationResponse;
}> = ({ validationError }) => {
    const { t } = useTranslation('projectSettings');
    const mark = <CustomMark />;
    if (isChartValidationError(validationError)) {
        // Handle chart configuration errors (unused dimensions)
        if (
            validationError.errorType === ValidationErrorType.ChartConfiguration
        ) {
            return (
                <Text fz="xs">
                    <CustomMark>{validationError.fieldName}</CustomMark>
                    {': '}
                    {validationError.error}
                </Text>
            );
        }
        // Model-level errors: the whole model is gone or failed to compile
        if (validationError.errorType === ValidationErrorType.Model) {
            return (
                <Text fz="xs">
                    <Trans
                        t={t}
                        i18nKey={
                            validationError.error.includes('failed to compile')
                                ? 'validator.errorMessage.modelFailedToCompile'
                                : 'validator.errorMessage.modelNoLongerExists'
                        }
                        values={{ tableName: validationError.tableName }}
                        components={{ mark }}
                    />
                </Text>
            );
        }
        return (
            <Text fz="xs">
                <Trans
                    t={t}
                    i18nKey="validator.errorMessage.fieldNoLongerExists"
                    values={{ fieldName: validationError.fieldName }}
                    components={{ mark }}
                />
            </Text>
        );
    }

    if (isDashboardValidationError(validationError)) {
        // Handle dashboard filter errors with typed error types
        if (validationError.dashboardFilterErrorType) {
            switch (validationError.dashboardFilterErrorType) {
                case DashboardFilterValidationErrorType.TableNotUsedByAnyChart:
                    return (
                        <Text fz="xs">
                            <Trans
                                t={t}
                                i18nKey="validator.errorMessage.tableNotUsedByAnyChart"
                                values={{
                                    fieldName: validationError.fieldName,
                                    tableName: validationError.tableName,
                                }}
                                components={{ mark }}
                            />
                        </Text>
                    );
                case DashboardFilterValidationErrorType.FieldDoesNotExist:
                    return (
                        <Text fz="xs">
                            <Trans
                                t={t}
                                i18nKey="validator.errorMessage.fieldNoLongerExists"
                                values={{
                                    fieldName: validationError.fieldName,
                                }}
                                components={{ mark }}
                            />
                        </Text>
                    );
                case DashboardFilterValidationErrorType.TableDoesNotExist:
                    return (
                        <Text fz="xs">
                            <Trans
                                t={t}
                                i18nKey="validator.errorMessage.tableNoLongerExists"
                                values={{
                                    tableName: validationError.tableName,
                                }}
                                components={{ mark }}
                            />
                        </Text>
                    );
                case DashboardFilterValidationErrorType.FieldTableMismatch:
                    return (
                        <Text fz="xs">
                            <Trans
                                t={t}
                                i18nKey="validator.errorMessage.fieldTableMismatch"
                                values={{
                                    fieldName: validationError.fieldName,
                                    tableName: validationError.tableName,
                                }}
                                components={{ mark }}
                            />
                        </Text>
                    );
                default:
                    return assertUnreachable(
                        validationError.dashboardFilterErrorType,
                        `Unexpected dashboard filter error type`,
                    );
            }
        }

        // Handle broken chart errors
        if (validationError.chartName) {
            return (
                <Text fz="xs">
                    <Trans
                        t={t}
                        i18nKey="validator.errorMessage.chartBroken"
                        values={{ chartName: validationError.chartName }}
                        components={{ mark }}
                    />
                </Text>
            );
        }

        // Fallback for unexpected cases
        return <Text fz="xs">{validationError.error}</Text>;
    }

    if (isDataAppValidationError(validationError)) {
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
    const { t } = useTranslation('projectSettings');
    const isWarning =
        isChartValidationError(validationError) &&
        validationError.errorType === ValidationErrorType.ChartConfiguration;

    return (
        <Stack gap={4}>
            <Text fw={600} c={isWarning ? 'orange.6' : 'red.6'} fz="xs">
                {t(
                    isWarning
                        ? 'validator.errorMessage.typeWarning'
                        : 'validator.errorMessage.typeError',
                    {
                        errorType: validationError.errorType
                            ? getErrorTypeLabel(validationError.errorType, t)
                            : '',
                    },
                )}
            </Text>
            <ErrorMessageByType validationError={validationError} />
        </Stack>
    );
};
