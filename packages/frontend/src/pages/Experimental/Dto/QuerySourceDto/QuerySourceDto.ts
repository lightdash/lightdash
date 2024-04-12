import type { ResultRow } from '@lightdash/common';

export abstract class QuerySourceDto {
    abstract type: string;

    abstract getData(): unknown;

    abstract getRows(): ResultRow[];

    abstract getFieldOptions(): string[];

    abstract getPivotOptions(): string[];
}
