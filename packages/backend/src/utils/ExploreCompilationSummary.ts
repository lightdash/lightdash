import {
    calculateCompilationReport,
    getDimensions,
    getFields,
    getMetrics,
    isExploreError,
    type CompilationHistoryReport,
    type Explore,
    type ExploreError,
} from '@lightdash/common';
import Logger from '../logging/logger';

export type ExploreCompilationAnalytics = {
    modelsCount: number;
    modelsWithErrorsCount: number;
    modelsWithGroupLabelCount: number;
    metricsCount: number;
    roundCount: number;
    urlsCount: number;
    formattedFieldsCount: number;
    modelsWithSqlFiltersCount: number;
    columnAccessFiltersCount: number;
    additionalDimensionsCount: number;
};

export class ExploreCompilationSummary {
    public readonly names: string[] = [];

    public readonly analytics: ExploreCompilationAnalytics = {
        modelsCount: 0,
        modelsWithErrorsCount: 0,
        modelsWithGroupLabelCount: 0,
        metricsCount: 0,
        roundCount: 0,
        urlsCount: 0,
        formattedFieldsCount: 0,
        modelsWithSqlFiltersCount: 0,
        columnAccessFiltersCount: 0,
        additionalDimensionsCount: 0,
    };

    public readonly caseSensitiveExplores: { name: string; value: boolean }[] =
        [];

    public readonly caseSensitiveDimensions: {
        table: string;
        name: string;
        value: boolean;
    }[] = [];

    private totalExploresCount = 0;

    private successfulExploresCount = 0;

    private errorExploresCount = 0;

    private reportMetricsCount = 0;

    private dimensionsCount = 0;

    private readonly exploresWithErrors: ExploreError[] = [];

    private readonly baseTableNames: string[] = [];

    public add(
        explore: Explore | ExploreError,
        collectAnalytics = false,
    ): void {
        this.names.push(explore.name);

        const report = calculateCompilationReport({ explores: [explore] });
        this.totalExploresCount += report.totalExploresCount;
        this.successfulExploresCount += report.successfulExploresCount;
        this.errorExploresCount += report.errorExploresCount;
        this.reportMetricsCount += report.metricsCount;
        this.dimensionsCount += report.dimensionsCount;
        this.exploresWithErrors.push(...report.exploresWithErrors);
        this.baseTableNames.push(...report.baseTableNames);

        if (explore.caseSensitive !== undefined) {
            this.caseSensitiveExplores.push({
                name: explore.name,
                value: explore.caseSensitive,
            });
        }

        Object.entries(explore.tables ?? {}).forEach(([table, value]) => {
            Object.values(value.dimensions ?? {}).forEach((dimension) => {
                if (dimension.caseSensitive !== undefined) {
                    this.caseSensitiveDimensions.push({
                        table,
                        name: dimension.name,
                        value: dimension.caseSensitive,
                    });
                }
            });
        });

        if (!collectAnalytics) return;

        this.analytics.modelsCount += 1;
        this.analytics.modelsWithErrorsCount += Number(isExploreError(explore));
        this.analytics.modelsWithGroupLabelCount += Number(
            Boolean(explore.groupLabel),
        );

        if (
            explore.baseTable &&
            explore.tables?.[explore.baseTable]?.sqlWhere !== undefined
        ) {
            this.analytics.modelsWithSqlFiltersCount += 1;
        }

        if (isExploreError(explore)) {
            return;
        }

        const metrics = getMetrics(explore);
        const dimensions = getDimensions(explore);
        const fields = getFields(explore);
        this.analytics.metricsCount += metrics.length;
        this.analytics.roundCount +=
            metrics.filter(({ round }) => round !== undefined).length +
            dimensions.filter(({ round }) => round !== undefined).length;
        this.analytics.urlsCount += fields.reduce(
            (count, field) => count + (field.urls || []).length,
            0,
        );
        try {
            this.analytics.formattedFieldsCount += getFields({
                ...explore,
                tables: {
                    [explore.baseTable]: explore.tables[explore.baseTable],
                },
            }).filter(({ format }) => format !== undefined).length;
        } catch (error) {
            Logger.error(`Unable to reduce formattedFieldsCount. ${error}`);
        }
        this.analytics.columnAccessFiltersCount += dimensions.filter(
            ({ requiredAttributes }) => requiredAttributes !== undefined,
        ).length;
        this.analytics.additionalDimensionsCount += Object.values(
            explore.tables[explore.baseTable]?.dimensions ?? {},
        ).filter(({ isAdditionalDimension }) => isAdditionalDimension).length;
    }

    public get report(): CompilationHistoryReport {
        return {
            totalExploresCount: this.totalExploresCount,
            successfulExploresCount: this.successfulExploresCount,
            errorExploresCount: this.errorExploresCount,
            metricsCount: this.reportMetricsCount,
            dimensionsCount: this.dimensionsCount,
            exploresWithErrors: this.exploresWithErrors,
            baseTableNames: this.baseTableNames,
        };
    }
}
