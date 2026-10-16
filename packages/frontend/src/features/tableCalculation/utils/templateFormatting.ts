import {
    assertUnreachable,
    TableCalculationTemplateType,
} from '@lightdash/common';
import i18n from '../../../i18n/i18n';

export const getTemplateTypeLabel = (
    type: TableCalculationTemplateType,
): string => {
    switch (type) {
        case TableCalculationTemplateType.PERCENT_CHANGE_FROM_PREVIOUS:
            return i18n.t('templateTypes.percentChangeFromPrevious.label', {
                ns: 'tableCalculation',
            });
        case TableCalculationTemplateType.DIFFERENCE_FROM_PREVIOUS:
            return i18n.t('templateTypes.differenceFromPrevious.label', {
                ns: 'tableCalculation',
            });
        case TableCalculationTemplateType.PERCENT_OF_PREVIOUS_VALUE:
            return i18n.t('templateTypes.percentOfPreviousValue.label', {
                ns: 'tableCalculation',
            });
        case TableCalculationTemplateType.PERCENT_OF_COLUMN_TOTAL:
            return i18n.t('templateTypes.percentOfColumnTotal.label', {
                ns: 'tableCalculation',
            });
        case TableCalculationTemplateType.RANK_IN_COLUMN:
            return i18n.t('templateTypes.rankInColumn.label', {
                ns: 'tableCalculation',
            });
        case TableCalculationTemplateType.RUNNING_TOTAL:
            return i18n.t('templateTypes.runningTotal.label', {
                ns: 'tableCalculation',
            });
        case TableCalculationTemplateType.WINDOW_FUNCTION:
            return i18n.t('templateTypes.windowFunction.label', {
                ns: 'tableCalculation',
            });
        default:
            return assertUnreachable(type, `Unknown template type`);
    }
};

export const formatTemplateType = (
    type: TableCalculationTemplateType,
): string => getTemplateTypeLabel(type) || type;

export const getTemplateDescription = (
    type: TableCalculationTemplateType,
): string => {
    switch (type) {
        case TableCalculationTemplateType.DIFFERENCE_FROM_PREVIOUS:
            return i18n.t('templateTypes.differenceFromPrevious.description', {
                ns: 'tableCalculation',
            });
        case TableCalculationTemplateType.PERCENT_CHANGE_FROM_PREVIOUS:
            return i18n.t(
                'templateTypes.percentChangeFromPrevious.description',
                { ns: 'tableCalculation' },
            );
        case TableCalculationTemplateType.PERCENT_OF_PREVIOUS_VALUE:
            return i18n.t('templateTypes.percentOfPreviousValue.description', {
                ns: 'tableCalculation',
            });
        case TableCalculationTemplateType.PERCENT_OF_COLUMN_TOTAL:
            return i18n.t('templateTypes.percentOfColumnTotal.description', {
                ns: 'tableCalculation',
            });
        case TableCalculationTemplateType.RANK_IN_COLUMN:
            return i18n.t('templateTypes.rankInColumn.description', {
                ns: 'tableCalculation',
            });
        case TableCalculationTemplateType.RUNNING_TOTAL:
            return i18n.t('templateTypes.runningTotal.description', {
                ns: 'tableCalculation',
            });
        case TableCalculationTemplateType.WINDOW_FUNCTION:
            return i18n.t('templateTypes.windowFunction.description', {
                ns: 'tableCalculation',
            });
        default:
            return assertUnreachable(type, `Unknown template type`);
    }
};
