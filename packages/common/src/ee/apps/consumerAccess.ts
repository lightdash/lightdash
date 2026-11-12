import {
    type DataReferenceLocation,
    type GlobalFilterReferenceUnresolvedPart,
    type PersistedDataAppDataReferences,
    type QueryReferenceUnresolvedPart,
} from './dataReferences';

/**
 * A place in the app's source whose data access could not be fully read, so
 * users without Explore access cannot run it.
 */
export type DataAppConsumerAccessIssue =
    | {
          kind: 'query';
          /** null when the explore itself could not be read. */
          explore: string | null;
          unresolved: QueryReferenceUnresolvedPart[];
          location: DataReferenceLocation;
      }
    | {
          kind: 'globalFilter';
          explore: string | null;
          unresolved: GlobalFilterReferenceUnresolvedPart[];
          location: DataReferenceLocation;
      };

export type DataAppConsumerAccessStatus =
    /** Every query in the version can run for consumers. */
    | 'available'
    /** Some queries, or queries under some filters, are refused. */
    | 'limited'
    /** No query can run: nothing readable, or no saved references. */
    | 'unavailable';

export type DataAppConsumerAccess = {
    status: DataAppConsumerAccessStatus;
    /** Queries found in the version's source. */
    queryCount: number;
    issues: DataAppConsumerAccessIssue[];
};

/**
 * What users without Explore access get from an app version, from the same
 * frozen references their queries are checked against at run time. A
 * reference with any unresolved part is left out of that allowlist, so it is
 * reported here.
 */
export const getDataAppConsumerAccess = (
    consumerDataReferences: PersistedDataAppDataReferences | null,
): DataAppConsumerAccess => {
    if (consumerDataReferences === null) {
        return { status: 'unavailable', queryCount: 0, issues: [] };
    }
    const issues: DataAppConsumerAccessIssue[] = [];
    let queryCount = 0;
    let runnableQueryCount = 0;
    for (const ref of consumerDataReferences.references) {
        if (ref.kind === 'query') {
            queryCount += 1;
            if (ref.unresolved.length === 0) {
                runnableQueryCount += 1;
            } else {
                issues.push({
                    kind: 'query',
                    explore: ref.explore,
                    unresolved: ref.unresolved,
                    location: ref.location,
                });
            }
        } else if (ref.kind === 'globalFilter' && ref.unresolved.length > 0) {
            issues.push({
                kind: 'globalFilter',
                explore: ref.explore,
                unresolved: ref.unresolved,
                location: ref.location,
            });
        }
    }
    if (issues.length === 0) {
        return { status: 'available', queryCount, issues };
    }
    return {
        status:
            queryCount > 0 && runnableQueryCount === 0
                ? 'unavailable'
                : 'limited',
        queryCount,
        issues,
    };
};
