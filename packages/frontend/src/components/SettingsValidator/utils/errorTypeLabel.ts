import { assertUnreachable, ValidationErrorType } from '@lightdash/common';
import { type TFunction } from 'i18next';

export const getErrorTypeLabel = (
    errorType: ValidationErrorType,
    t: TFunction<'projectSettings'>,
): string => {
    switch (errorType) {
        case ValidationErrorType.Chart:
            return t('validator.errorTypes.chart');
        case ValidationErrorType.Sorting:
            return t('validator.errorTypes.sorting');
        case ValidationErrorType.Filter:
            return t('validator.errorTypes.filter');
        case ValidationErrorType.Metric:
            return t('validator.errorTypes.metric');
        case ValidationErrorType.Model:
            return t('validator.errorTypes.model');
        case ValidationErrorType.Dimension:
            return t('validator.errorTypes.dimension');
        case ValidationErrorType.CustomMetric:
            return t('validator.errorTypes.customMetric');
        case ValidationErrorType.ChartConfiguration:
            return t('validator.errorTypes.chartConfiguration');
        case ValidationErrorType.ExploreSplit:
            return t('validator.errorTypes.exploreSplit');
        default:
            return assertUnreachable(
                errorType,
                'Unknown validation error type',
            );
    }
};
