import type { ApiSqlQueryResults, ResultRow } from '@lightdash/common';
import { QuerySourceDto } from './QuerySourceDto';

type SqlRunnerDtoArguments = {
    data: ApiSqlQueryResults;
};

export class SqlRunnerDto extends QuerySourceDto {
    public type = 'sql_runner' as const;

    private readonly data: ApiSqlQueryResults;

    constructor(args: SqlRunnerDtoArguments) {
        super();
        this.data = args.data;
    }

    public getData() {
        return this.data;
    }

    public getFieldOptions() {
        return Object.keys(this.data.fields);
    }

    public getPivotOptions() {
        return Object.keys(this.data.fields);
    }

    public getRows() {
        return (this.data.rows || []).map((row) =>
            Object.keys(row).reduce<ResultRow>((acc, columnName) => {
                const raw = row[columnName];
                return {
                    ...acc,
                    [columnName]: {
                        value: {
                            raw,
                            formatted: `${raw}`,
                        },
                    },
                };
            }, {}),
        );
    }
}
