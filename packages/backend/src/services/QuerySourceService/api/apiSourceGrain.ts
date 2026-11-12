import {
    getDimensions,
    getItemId,
    type ApiSourceQueryIssue,
    type Explore,
    type FieldId,
} from '@lightdash/common';
import { toFieldCombinationIssue } from './apiSourceExplore';

/**
 * What an ads API returns one row per at a level, and which selected fields
 * tell those rows apart. Each identity is a set of API names that identify a
 * row only together, like an ad set name with its campaign name.
 */
export type ApiSourceGrain = {
    entity: string;
    identities: readonly (readonly string[])[];
    /** How to fix the query, like "Add Campaign name or Campaign ID." */
    fix: string;
};

/**
 * Ads APIs report per entity and have no GROUP BY: asked for a campaign
 * attribute alone they answer once per campaign, which reads like a grouped
 * total but isn't. So every row must be identified by what was selected.
 * Breakdowns the API aggregates itself, like country, have no grain.
 */
export const getGrainIssues = <Level extends string>({
    explore,
    integration,
    grains,
    level,
    levelOf,
    dimensions,
    apiName,
}: {
    explore: Explore;
    integration: string;
    grains: Partial<Record<Level, ApiSourceGrain>>;
    /** The level the request reports at. */
    level: Level;
    levelOf: (apiName: string) => Level | null | undefined;
    /** Selected dimension field IDs. */
    dimensions: FieldId[];
    apiName: (fieldId: FieldId) => string;
}): ApiSourceQueryIssue[] => {
    const grain = grains[level];
    const selected = new Set(dimensions.map(apiName));
    if (
        !grain ||
        grain.identities.some((identity) =>
            identity.every((name) => selected.has(name)),
        )
    ) {
        return [];
    }
    const fieldId =
        dimensions.find((id) => levelOf(apiName(id)) === level) ?? null;
    const label =
        getDimensions(explore).find(
            (dimension) => getItemId(dimension) === fieldId,
        )?.label ?? fieldId;
    return [
        toFieldCombinationIssue(
            fieldId,
            `${integration} returns one row per ${grain.entity} and can't group them by ${label}. ${grain.fix}`,
        ),
    ];
};
