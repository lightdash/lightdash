import {
    InlineErrorType,
    parseDbtPreAggregates,
    type ExploreError,
    type ExplorePostProcessor,
} from '@lightdash/common';
import attempt from 'lodash/attempt';
import isError from 'lodash/isError';
import { lightdashConfig } from '../../config/lightdashConfig';
import { generatePreAggregateExplores } from './generatePreAggregateExplores';

export const preAggregatePostProcessor: ExplorePostProcessor = (
    compiledExplores,
    { model, meta, startOfWeek },
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

    // Attach parsed defs to explores
    const exploresWithPreAggregates = compiledExplores.map((explore) =>
        parsedPreAggregates.length > 0
            ? { ...explore, preAggregates: parsedPreAggregates }
            : explore,
    );

    // Virtual pre-aggregate explores need the instance infra (licence and
    // storage). The per-organization switch is applied where the org is known.
    if (!lightdashConfig.preAggregates.enabled) {
        return exploresWithPreAggregates;
    }

    return generatePreAggregateExplores({
        compiledExplores: exploresWithPreAggregates,
        parsedPreAggregates,
        startOfWeek,
    });
};
