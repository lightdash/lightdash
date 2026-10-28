export type CachedExploreSource = {
    name: string;
    sourceUuid: string | null;
    packageName: string | null;
};

export const cachedExploreSourcesForSources = (
    explores: CachedExploreSource[],
    currentSourceUuids: string[],
    requestedSourceUuids: string[],
): Map<string, string> => {
    const currentSources = new Set(currentSourceUuids);
    const requestedSources = new Set(requestedSourceUuids);
    const packageOwners = new Map<string, Set<string>>();
    for (const { sourceUuid, packageName } of explores) {
        if (sourceUuid && packageName && currentSources.has(sourceUuid)) {
            const owners = packageOwners.get(packageName) ?? new Set<string>();
            owners.add(sourceUuid);
            packageOwners.set(packageName, owners);
        }
    }
    return new Map(
        explores.flatMap(({ sourceUuid: stamp, packageName, name }) => {
            let sourceUuid = stamp;
            if (!sourceUuid || !currentSources.has(sourceUuid)) {
                const owners = packageName
                    ? packageOwners.get(packageName)
                    : undefined;
                sourceUuid = owners?.size === 1 ? [...owners][0] : null;
            }
            return sourceUuid && requestedSources.has(sourceUuid)
                ? [[name, sourceUuid] as const]
                : [];
        }),
    );
};
