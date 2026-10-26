import {
    InlineErrorType,
    UnexpectedServerError,
    type Explore,
    type ExploreError,
} from '@lightdash/common';
import { rewriteAllocatedSql } from './allocatedExploreReferences';

const deferredName = /__model_(?:[0-9a-f]{6})+/;

export const validateExplorePublication = (
    explore: Explore | ExploreError,
    persistedName = explore.name,
): Explore | ExploreError => {
    const identity = explore.dbtModelIdentity;
    const table = explore.tables?.[explore.baseTable ?? explore.name];
    const source =
        identity?.sourceName ??
        identity?.sourceUuid ??
        table?.dbtSourceName ??
        table?.dbtSourceUuid ??
        'primary';
    const failure = (detail: string) =>
        `Cannot publish explore "${explore.name}" from source "${source}": ${detail}`;
    if (
        persistedName !== explore.name ||
        Array.from(persistedName).length > 255 ||
        deferredName.test(persistedName)
    ) {
        const error = new UnexpectedServerError(
            failure(
                'the staged name must match the allocated name, be at most 255 characters and contain no temporary model name.',
            ),
        );
        error.name = 'ExplorePublicationError';
        throw error;
    }
    const findDeferredReference = (
        value: unknown,
        path: string,
        property = '',
    ): string | undefined => {
        if (typeof value === 'string') {
            if (!deferredName.test(value)) return undefined;
            if (/sql$/i.test(property) || property === 'sqlTable') {
                const references = new Map(
                    [...value.matchAll(/__model_[a-zA-Z0-9_]+/g)].map(
                        ([name]) => [name, 'unallocated_model'],
                    ),
                );
                return rewriteAllocatedSql(value, references) !== value
                    ? path
                    : undefined;
            }
            return path;
        }
        if (value === null || typeof value !== 'object') return undefined;
        const references = Object.entries(value).filter(
            ([key]) =>
                !['label', 'description', 'errors', 'warnings'].includes(key),
        );
        for (const [key, child] of references) {
            const childPath = `${path}.${key}`;
            if (deferredName.test(key)) return childPath;
            const invalid = findDeferredReference(child, childPath, key);
            if (invalid) return invalid;
        }
        return undefined;
    };
    const invalid = findDeferredReference(explore, 'explore');
    if (!invalid) return explore;
    return {
        name: explore.name,
        label: explore.label,
        type: explore.type,
        groupLabel: explore.groupLabel,
        groups: explore.groups,
        ...(identity && !findDeferredReference(identity, 'identity')
            ? { dbtModelIdentity: identity }
            : {}),
        errors: [
            {
                type: InlineErrorType.FIELD_ERROR,
                message: failure(
                    `unresolved temporary model reference at "${invalid}". Compile this source again.`,
                ),
            },
        ],
    };
};
