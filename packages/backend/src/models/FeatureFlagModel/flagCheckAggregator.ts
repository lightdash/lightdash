const MAX_ORG_UUIDS = 50;

type FeatureFlagCheckAggregate = {
    checkCount: number;
    enabledCount: number;
    disabledCount: number;
    orgUuids: Set<string>;
    orgUuidsTruncated: boolean;
};

export type FeatureFlagCheckAggregateEntry = {
    flagId: string;
    checkCount: number;
    enabledCount: number;
    disabledCount: number;
    uniqueOrgCount: number;
    orgUuids: string[];
    orgUuidsTruncated: boolean;
    windowStartAt: string;
    windowEndAt: string;
};

let aggregates = new Map<string, FeatureFlagCheckAggregate>();
let windowStartAt = new Date();

export const record = (
    flagId: string,
    orgUuid: string | null,
    enabled: boolean,
) => {
    const aggregate = aggregates.get(flagId) ?? {
        checkCount: 0,
        enabledCount: 0,
        disabledCount: 0,
        orgUuids: new Set<string>(),
        orgUuidsTruncated: false,
    };

    aggregate.checkCount += 1;
    if (enabled) {
        aggregate.enabledCount += 1;
    } else {
        aggregate.disabledCount += 1;
    }

    if (orgUuid !== null && !aggregate.orgUuids.has(orgUuid)) {
        if (aggregate.orgUuids.size < MAX_ORG_UUIDS) {
            aggregate.orgUuids.add(orgUuid);
        } else {
            aggregate.orgUuidsTruncated = true;
        }
    }

    aggregates.set(flagId, aggregate);
};

export const flush = (): FeatureFlagCheckAggregateEntry[] => {
    const windowEndAt = new Date();
    const entries = Array.from(aggregates, ([flagId, aggregate]) => ({
        flagId,
        checkCount: aggregate.checkCount,
        enabledCount: aggregate.enabledCount,
        disabledCount: aggregate.disabledCount,
        uniqueOrgCount: aggregate.orgUuids.size,
        orgUuids: Array.from(aggregate.orgUuids),
        orgUuidsTruncated: aggregate.orgUuidsTruncated,
        windowStartAt: windowStartAt.toISOString(),
        windowEndAt: windowEndAt.toISOString(),
    }));

    aggregates = new Map();
    windowStartAt = windowEndAt;

    return entries;
};
