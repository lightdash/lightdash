import type { ApiQueryResults } from '@lightdash/common';
import { QuerySourceDto } from './QuerySourceDto';

type ExplorerDtoArguments = {
    data: ApiQueryResults;
};

export class ExplorerDto extends QuerySourceDto {
    public type = 'explorer' as const;

    private readonly data: ApiQueryResults;

    constructor(args: ExplorerDtoArguments) {
        super();
        this.data = args.data;
    }

    public getData() {
        return this.data;
    }

    public getFieldOptions() {
        return [
            ...this.data.metricQuery.dimensions,
            ...this.data.metricQuery.metrics,
        ];
    }

    public getPivotOptions() {
        return this.data.metricQuery.dimensions;
    }

    public getRows() {
        return this.data.rows;
    }
}
