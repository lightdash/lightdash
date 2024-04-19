import { type ApiQueryResults } from '../../index';
import { AbstractResultTransformer } from './AbstractResultTransformer';

type ExplorerResultTransformerArguments = {
    data: ApiQueryResults;
};

export class ExplorerResultsTransformer extends AbstractResultTransformer {
    public type = 'explorer' as const;

    private readonly data: ApiQueryResults;

    constructor(args: ExplorerResultTransformerArguments) {
        super();
        this.data = args.data;
    }

    public getFieldOptions() {
        return [
            ...this.data.metricQuery.dimensions,
            ...this.data.metricQuery.metrics,
        ];
    }

    public getRows() {
        return this.data.rows;
    }
}
