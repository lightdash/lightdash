import { type SqlRunnerResults } from '../../types/sqlRunner';

export class SqlRunnerResultsTransformer {
    private readonly data: SqlRunnerResults;

    constructor(args: { data: SqlRunnerResults }) {
        this.data = args.data;
    }

    public getRows() {
        return this.data;
    }

    public getColumns() {
        return Object.keys(this.data[0]);
    }
}
