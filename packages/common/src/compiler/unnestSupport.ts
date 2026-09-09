import {
    InlineErrorType,
    isExploreError,
    type Explore,
    type ExploreError,
    type InlineError,
} from '../types/explore';

/** First CLI release that unnests repeated columns when the flag is on. */
export const UNNEST_REPEATED_COLUMNS_MIN_CLI_VERSION = '2.153.0';

const parseVersion = (version: string): number[] | null => {
    const match = version.trim().match(/^v?(\d+)\.(\d+)\.(\d+)/);
    return match ? match.slice(1, 4).map(Number) : null;
};

/** True when `version` is a release older than `minimum`; unparseable versions are treated as current. */
export const isVersionBefore = (version: string, minimum: string): boolean => {
    const a = parseVersion(version);
    const b = parseVersion(minimum);
    if (!a || !b) {
        return false;
    }
    const diff = a.map((part, i) => part - b[i]).find((d) => d !== 0);
    return diff !== undefined && diff < 0;
};

/**
 * Warning for a model whose documented leaves sit under repeated columns
 * but were compiled as plain dotted dimensions: BigQuery rejects a dotted
 * dereference into an array, so those fields fail the moment they are
 * selected.
 */
export const repeatedColumnsNotUnnestedWarning = ({
    modelName,
    leavesByContainer,
    reason,
}: {
    modelName: string;
    leavesByContainer: Record<string, string[]>;
    reason: string;
}): InlineError => {
    const containers = Object.entries(leavesByContainer)
        .map(
            ([container, leaves]) =>
                `"${container}" (${leaves.slice(0, 3).join(', ')}${
                    leaves.length > 3 ? `, +${leaves.length - 3} more` : ''
                })`,
        )
        .join('; ');
    return {
        type: InlineErrorType.REPEATED_COLUMN_NOT_UNNESTED,
        message: `Model "${modelName}" documents fields under repeated columns ${containers} but they were compiled as plain dimensions, which fail on BigQuery when selected. ${reason}`,
    };
};

export const UNNEST_FLAG_OFF_REASON =
    'Repeated columns are unnested only when the unnest-repeated-columns feature is enabled for the organisation.';

/**
 * A CLI older than the unnest release compiles every dotted leaf as a plain
 * dimension and reports no shapes, so the server can only see the dotted
 * names. Flag them on the base table of each explore so the deploy is not
 * silent; a struct leaf among them is harmless and the message says so.
 */
export const addOldCliUnnestWarnings = (
    explores: (Explore | ExploreError)[],
    cliVersion: string,
): (Explore | ExploreError)[] =>
    explores.map((explore) => {
        if (isExploreError(explore)) {
            return explore;
        }
        const baseTable = explore.tables[explore.baseTable];
        const dottedLeaves = Object.values(baseTable?.dimensions ?? {})
            .filter(
                (dimension) =>
                    dimension.name.includes('.') &&
                    dimension.sql === `\${TABLE}.${dimension.name}`,
            )
            .map((dimension) => dimension.name);
        if (dottedLeaves.length === 0) {
            return explore;
        }
        const warning: InlineError = {
            type: InlineErrorType.REPEATED_COLUMN_NOT_UNNESTED,
            message: `Model "${explore.baseTable}" documents nested fields (${dottedLeaves
                .slice(0, 3)
                .join(', ')}${
                dottedLeaves.length > 3
                    ? `, +${dottedLeaves.length - 3} more`
                    : ''
            }) but was deployed with Lightdash CLI ${cliVersion}, which does not unnest repeated columns: any of these fields under an array fails on BigQuery when selected. Upgrade the CLI to ${UNNEST_REPEATED_COLUMNS_MIN_CLI_VERSION} or later and deploy again.`,
        };
        return { ...explore, warnings: [...(explore.warnings ?? []), warning] };
    });
