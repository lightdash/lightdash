export type ExploreNamePolicyModel = {
    ownerKey: string;
    sourceKey: string;
    modelName: string;
};

type ExploreNamePolicyAllocation = {
    name: string;
    ownerKey: string | null;
};

export const planExploreNameClaims = ({
    candidates,
    savedModels,
    allocations,
}: {
    candidates: ExploreNamePolicyModel[];
    savedModels: ExploreNamePolicyModel[];
    allocations: ExploreNamePolicyAllocation[];
}): {
    reservations: string[];
    plainClaims: { ownerKey: string; name: string }[];
} => {
    const sourcesByModel = new Map<string, Set<string>>();
    [...savedModels, ...candidates].forEach(({ sourceKey, modelName }) => {
        const sources = sourcesByModel.get(modelName) ?? new Set<string>();
        sources.add(sourceKey);
        sourcesByModel.set(modelName, sources);
    });
    const blockedNames = new Set(allocations.map(({ name }) => name));
    const owners = new Set(
        allocations.flatMap(({ ownerKey }) =>
            ownerKey === null ? [] : [ownerKey],
        ),
    );
    const reservations = [...sourcesByModel]
        .filter(
            ([modelName, sources]) =>
                sources.size > 1 && !blockedNames.has(modelName),
        )
        .map(([modelName]) => modelName)
        .sort();
    reservations.forEach((name) => blockedNames.add(name));
    const plainClaims: { ownerKey: string; name: string }[] = [];
    [...candidates]
        .sort((left, right) => {
            if (left.ownerKey === right.ownerKey) return 0;
            return left.ownerKey < right.ownerKey ? -1 : 1;
        })
        .forEach(({ ownerKey, modelName }) => {
            if (owners.has(ownerKey) || blockedNames.has(modelName)) return;
            plainClaims.push({ ownerKey, name: modelName });
            owners.add(ownerKey);
            blockedNames.add(modelName);
        });
    return { reservations, plainClaims };
};
