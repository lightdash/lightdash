import {
    type Explore,
    type ExploreError,
    getDimensions,
    getFields,
    getMetrics,
    isExploreError,
} from '@lightdash/common';
import { sumBy } from 'lodash';

export type CalculatedCompilationReport = {
    totalModelCount: number;
    modelsWithoutErrorsCount: number;
    modelsWithErrorsCount: number;
    modelsWithErrors: ExploreError[];
    modelsWithGroupLabelCount: number;
    metricsCount: number;
    dimensionsCount: number;
    fieldsUrlCount: number;
    fieldsWithRoundCount: number;
    formattedFieldsCount: number;
    modelsWithSqlFiltersCount: number;
    dimensionsWithColumnAccessFiltersCount: number;
    additionalDimensionsCount: number;
};

const isDefined = <T>(value: T): boolean => value !== undefined;

/* eslint-disable no-param-reassign */
export const calculateCompilationStats = (args: {
    explores: (Explore | ExploreError)[];
}): CalculatedCompilationReport =>
    args.explores.reduce<CalculatedCompilationReport>(
        (report, explore) => {
            report.totalModelCount += 1;

            if (isExploreError(explore)) {
                report.modelsWithErrors.push(explore);
                report.modelsWithErrorsCount += 1;
                return report;
            }

            const baseTable = explore.tables[explore.baseTable];
            const metrics = getMetrics(explore);
            const dimensions = getDimensions(explore);
            const allFields = [...metrics, ...dimensions];

            report.modelsWithoutErrorsCount += 1;
            report.metricsCount += metrics.length;
            report.dimensionsCount += dimensions.length;

            if (isDefined(explore.groupLabel)) {
                report.modelsWithGroupLabelCount += 1;
            }
            if (isDefined(baseTable.sqlWhere)) {
                report.modelsWithSqlFiltersCount += 1;
            }

            report.fieldsWithRoundCount += allFields.filter(({ round }) =>
                isDefined(round),
            ).length;

            report.fieldsUrlCount += sumBy(
                allFields,
                (f) => (f.urls || []).length,
            );

            const baseTableFields = getFields({
                ...explore,
                tables: { [explore.baseTable]: baseTable },
            });
            report.formattedFieldsCount += baseTableFields.filter(
                ({ format }) => isDefined(format),
            ).length;

            report.dimensionsWithColumnAccessFiltersCount += dimensions.filter(
                ({ requiredAttributes }) => isDefined(requiredAttributes),
            ).length;

            report.additionalDimensionsCount += Object.values(
                baseTable.dimensions,
            ).filter(({ isAdditionalDimension }) =>
                isDefined(isAdditionalDimension),
            ).length;

            return report;
        },
        {
            totalModelCount: 0,
            modelsWithoutErrorsCount: 0,
            modelsWithErrorsCount: 0,
            modelsWithErrors: [],
            modelsWithGroupLabelCount: 0,
            metricsCount: 0,
            dimensionsCount: 0,
            fieldsUrlCount: 0,
            fieldsWithRoundCount: 0,
            formattedFieldsCount: 0,
            modelsWithSqlFiltersCount: 0,
            dimensionsWithColumnAccessFiltersCount: 0,
            additionalDimensionsCount: 0,
        },
    );
/* eslint-enable no-param-reassign */
