import type { DuckdbExecutionSpec } from '@lightdash/common';

/**
 * A DuckDB source query refused by the guard over its references, before
 * anything ran. Distinct from a failure so the run can record the refusal
 * on the row and whoever reports the outcome can tell the two apart.
 */
export class DuckdbQueryRefusal extends Error {
    readonly refusal: NonNullable<DuckdbExecutionSpec['refusal']>;

    constructor(
        message: string,
        refusal: NonNullable<DuckdbExecutionSpec['refusal']>,
    ) {
        super(message);
        this.name = 'DuckdbQueryRefusal';
        this.refusal = refusal;
    }
}
