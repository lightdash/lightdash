import {
    FieldType,
    isSemanticLayerColumnArray,
    type PivotChartData,
    type RawResultRow,
    type SemanticLayerColumn,
    type SemanticLayerPivot,
    type SemanticLayerQuery,
    type VizChartLayout,
    type VizIndexLayoutOptions,
    type VizPivotLayoutOptions,
    type VizValuesLayoutOptions,
} from '@lightdash/common';
import { ResultsRunner } from '../../../components/DataViz/transformers/ResultsRunner';
import { apiGetSemanticLayerQueryResults } from '../api/requests';

const transformChartLayoutToSemanticPivot = (
    config: VizChartLayout,
): SemanticLayerPivot => {
    return {
        on: config.x ? [config.x.reference] : [],
        index: config.groupBy?.map((groupBy) => groupBy.reference) ?? [],
        values: config.y.map((y) => y.reference),
    };
};

export class SemanticViewerResultsRunner extends ResultsRunner {
    private readonly query: SemanticLayerQuery;

    private readonly projectUuid: string;

    constructor({
        query,
        projectUuid,
        ...args
    }: {
        query: SemanticLayerQuery;
        projectUuid: string;
        rows: RawResultRow[];
        columns: SemanticLayerColumn[];
    }) {
        super(args);

        this.query = query;
        this.projectUuid = projectUuid;
    }

    pivotChartOptions(): {
        indexLayoutOptions: VizIndexLayoutOptions[];
        valuesLayoutOptions: VizValuesLayoutOptions[];
        pivotLayoutOptions: VizPivotLayoutOptions[];
    } {
        // TODO: these typechecks are unfortunate. We should use generics or clean up
        // the hierarchy so that we don't need them.
        if (!isSemanticLayerColumnArray(this.columns)) {
            return {
                indexLayoutOptions: [],
                valuesLayoutOptions: [],
                pivotLayoutOptions: [],
            };
        }
        return {
            indexLayoutOptions: this.columns.reduce((acc, column) => {
                if (column.kind === FieldType.DIMENSION) {
                    acc.push({
                        reference: column.reference,
                        type: this.getAxisType(column),
                    });
                }
                return acc;
            }, [] as VizIndexLayoutOptions[]),
            valuesLayoutOptions: this.columns.reduce((acc, column) => {
                if (column.kind === FieldType.METRIC) {
                    acc.push({
                        reference: column.reference,
                    });
                }
                return acc;
            }, [] as VizValuesLayoutOptions[]),
            pivotLayoutOptions: this.columns.filter(
                (column) => column.kind === FieldType.DIMENSION,
            ),
        };
    }

    defaultPivotChartLayout(): VizChartLayout | undefined {
        // TODO: a second unfortunate typecheck. See comment in pivotChartOptions.
        if (!isSemanticLayerColumnArray(this.columns)) {
            return undefined;
        }

        const xColumn = this.columns.find(
            (column) => column.kind === FieldType.DIMENSION,
        );

        const yColumn = this.columns.find(
            (column) => column.kind === FieldType.METRIC,
        );

        return {
            x: xColumn
                ? {
                      reference: xColumn.reference,
                      type: this.getAxisType(xColumn),
                  }
                : undefined,
            y: yColumn
                ? [
                      {
                          reference: yColumn.reference,
                      },
                  ]
                : [],
            groupBy: [],
        };
    }

    async getPivotChartData(config: VizChartLayout): Promise<PivotChartData> {
        const pivotConfig = transformChartLayoutToSemanticPivot(config);
        const pivotedResults = await apiGetSemanticLayerQueryResults({
            projectUuid: this.projectUuid,
            query: {
                ...this.query,
                pivot: pivotConfig,
            },
        });

        // TODO: confirm if it is correct
        return {
            indexColumn: config.x,
            results: pivotedResults ?? [],
            valuesColumns: Object.keys(pivotedResults?.[0] ?? {}).filter(
                (name) =>
                    ![...pivotConfig.index, ...pivotConfig.on].includes(name),
            ),
        };
    }
}
