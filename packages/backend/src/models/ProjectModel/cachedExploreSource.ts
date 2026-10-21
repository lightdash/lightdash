export type CachedExploreSource = {
    name: string;
    sourceUuid: string | null;
    packageName: string | null;
};

export type CachedSourceCatalog = {
    sourceUuid: string;
    packageName: string;
    nodePackageNames: string[];
};

export const cachedExploreNamesForSources = (
    explores: CachedExploreSource[],
    catalogs: CachedSourceCatalog[],
    currentSourceUuids: string[],
    requestedSourceUuids: string[],
): string[] => {
    const currentSources = new Set(currentSourceUuids);
    const requestedSources = new Set(requestedSourceUuids);
    const packageOwners = new Map<string, Set<string>>();
    for (const { sourceUuid, packageName, nodePackageNames } of catalogs) {
        if (currentSources.has(sourceUuid)) {
            for (const name of [packageName, ...nodePackageNames]) {
                const owners = packageOwners.get(name) ?? new Set<string>();
                owners.add(sourceUuid);
                packageOwners.set(name, owners);
            }
        }
    }
    return explores.flatMap(({ sourceUuid: stamp, packageName, name }) => {
        let sourceUuid = stamp;
        if (!sourceUuid || !currentSources.has(sourceUuid)) {
            const owners = packageName
                ? packageOwners.get(packageName)
                : undefined;
            sourceUuid = owners?.size === 1 ? [...owners][0] : null;
        }
        return sourceUuid && requestedSources.has(sourceUuid) ? [name] : [];
    });
};
