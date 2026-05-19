import { ParseError } from '@lightdash/common';

export const convertSparkSchema = (): never => {
    throw new ParseError(
        `Spark dbt projects don't provide warehouse credentials directly. ` +
            `Use --no-warehouse-credentials flag, then configure your ` +
            `query engine (e.g., Athena) in the Lightdash UI.`,
    );
};
