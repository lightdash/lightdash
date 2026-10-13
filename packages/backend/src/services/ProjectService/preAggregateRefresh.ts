import {
    ForbiddenError,
    UnexpectedServerError,
    type Explore,
    type ExploreError,
} from '@lightdash/common';

export type StoredPreAggregateRefresh = {
    hasScheduledDefinition: boolean;
    hasScheduledRefresh: boolean;
    hasMalformedPreAggregates: boolean;
};

export const EMPTY_PRE_AGGREGATE_REFRESH: Readonly<StoredPreAggregateRefresh> =
    {
        hasScheduledDefinition: false,
        hasScheduledRefresh: false,
        hasMalformedPreAggregates: false,
    };

const malformedMessage =
    'Explores for this project have an invalid pre-aggregate definition.';

export const assertPreAggregateRefresh = (
    stored: StoredPreAggregateRefresh,
    incoming: (Explore | ExploreError)[],
): void => {
    if (stored.hasScheduledDefinition || stored.hasScheduledRefresh)
        throw new ForbiddenError(
            'This agent connection cannot deploy to, refresh or change parameters of this project, because the project has pre-aggregates with a scheduled refresh. A person can do this, or use a project without scheduled pre-aggregate refreshes.',
        );
    if (stored.hasMalformedPreAggregates)
        throw new UnexpectedServerError(malformedMessage);

    let hasScheduledRefresh = false;
    let hasMalformedPreAggregates = false;
    incoming.forEach((explore) => {
        if (explore === null || typeof explore !== 'object') {
            hasMalformedPreAggregates = true;
            return;
        }
        if (!('preAggregates' in explore) || explore.preAggregates == null)
            return;
        if (!Array.isArray(explore.preAggregates)) {
            hasMalformedPreAggregates = true;
            return;
        }
        explore.preAggregates.forEach((definition) => {
            if (definition == null) {
                hasMalformedPreAggregates = true;
                return;
            }
            if (definition.refresh?.cron != null) hasScheduledRefresh = true;
        });
    });
    if (hasScheduledRefresh)
        throw new ForbiddenError(
            'This agent connection cannot add a pre-aggregate with a scheduled refresh. A person can add it.',
        );
    if (hasMalformedPreAggregates)
        throw new UnexpectedServerError(malformedMessage);
};
