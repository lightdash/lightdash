import { type SqlRunnerResults } from '../types/sqlRunner';

export class ResultsTableModel {
    // TODO: remove sql runner specific types
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
