import attempt from 'lodash/attempt';
import isError from 'lodash/isError';
import type { ExplorePostProcessor } from '../compiler/translator';
import { InlineErrorType, type ExploreError } from '../types/explore';
import { parseDbtPreAggregates } from './definition';

/**
 * Base post-processor that parses pre-aggregate definitions from dbt meta
 * and attaches them to compiled explores. Does NOT generate virtual
 * pre-aggregate explores — that is handled by the EE post-processor
 * which extends this behavior.
 */
export const preAggregatePostProcessor: ExplorePostProcessor = (
    compiledExplores,
    { model, meta },
) => {
    const parsedPreAggregates = attempt(
        parseDbtPreAggregates,
        meta.pre_aggregates,
        model.name,
    );

    if (isError(parsedPreAggregates)) {
        return compiledExplores.map(
            (explore) =>
                ({
                    name: explore.name,
                    label: explore.label,
                    groupLabel: explore.groupLabel,
                    ...(explore.groups && explore.groups.length > 0
                        ? { groups: explore.groups }
                        : {}),
                    errors: [
                        {
                            type: InlineErrorType.METADATA_PARSE_ERROR,
                            message:
                                parsedPreAggregates.message ||
                                `Could not parse pre-aggregates for model "${model.name}"`,
                        },
                    ],
                }) satisfies ExploreError,
        );
    }

    // Attach parsed defs to explores (no virtual explore generation)
    return compiledExplores.map((explore) =>
        parsedPreAggregates.length > 0
            ? { ...explore, preAggregates: parsedPreAggregates }
            : explore,
    );
};
