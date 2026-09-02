import { ParameterError } from '../types/errors';

type ManifestNamedItem = {
    uniqueId: string;
    name: string;
} & ManifestNamespaceFields;

export type ManifestNamespaceFields = {
    lightdash_source_name?: string;
    package_name?: string;
};

export type ManifestNamespace = {
    kind: 'source' | 'package';
    name: string;
};

export const getManifestNamespace = (
    item: ManifestNamespaceFields,
): ManifestNamespace | undefined => {
    // Merged-source manifests use the Lightdash source name. Native dbt Mesh
    // manifests have no source annotation, so the dbt package is their namespace.
    if (item.lightdash_source_name !== undefined) {
        return { kind: 'source', name: item.lightdash_source_name };
    }
    if (item.package_name !== undefined) {
        return { kind: 'package', name: item.package_name };
    }
    return undefined;
};

export const getManifestNamespaceKey = (
    item: ManifestNamespaceFields,
    name: string,
): string | undefined => {
    const namespace = getManifestNamespace(item);
    return namespace
        ? `${namespace.kind}\u0000${namespace.name}\u0000${name}`
        : undefined;
};

export const qualifyManifestNames = (
    items: ManifestNamedItem[],
    itemType: 'model' | 'metric',
): Map<string, string> => {
    const namespacesByName = new Map<string, Set<string>>();
    items.forEach((item) => {
        const namespace = getManifestNamespace(item);
        if (namespace === undefined) {
            return;
        }
        const namespaces = namespacesByName.get(item.name) ?? new Set<string>();
        namespaces.add(`${namespace.kind}\u0000${namespace.name}`);
        namespacesByName.set(item.name, namespaces);
    });

    const collidingNames = new Set(
        Array.from(namespacesByName)
            .filter(([, namespaces]) => namespaces.size > 1)
            .map(([name]) => name),
    );
    const resolvedNames = new Map(
        items.map((item) => {
            const namespace = getManifestNamespace(item);
            return [
                item.uniqueId,
                namespace !== undefined && collidingNames.has(item.name)
                    ? `${namespace.name}__${item.name}`
                    : item.name,
            ];
        }),
    );

    const itemsByResolvedName = new Map<string, ManifestNamedItem[]>();
    items.forEach((item) => {
        const resolvedName = resolvedNames.get(item.uniqueId) ?? item.name;
        const resolvedItems = itemsByResolvedName.get(resolvedName) ?? [];
        resolvedItems.push(item);
        itemsByResolvedName.set(resolvedName, resolvedItems);
    });

    const postQualificationCollision = Array.from(itemsByResolvedName)
        .filter(
            ([resolvedName, resolvedItems]) =>
                resolvedItems.length > 1 &&
                resolvedItems.some((item) => item.name !== resolvedName),
        )
        .sort(([left], [right]) => left.localeCompare(right))[0];
    if (postQualificationCollision) {
        const [resolvedName, resolvedItems] = postQualificationCollision;
        const namespaceKinds = new Set(
            resolvedItems
                .map((item) => getManifestNamespace(item)?.kind)
                .filter((kind): kind is ManifestNamespace['kind'] => !!kind),
        );
        let collisionContext = 'dbt';
        let renameTarget = 'source, package';
        if (namespaceKinds.size === 1 && namespaceKinds.has('source')) {
            collisionContext = 'Merged dbt';
            renameTarget = 'source';
        } else if (namespaceKinds.size === 1 && namespaceKinds.has('package')) {
            collisionContext = 'dbt Mesh';
            renameTarget = 'package';
        }
        const parties = [...resolvedItems]
            .sort(
                (left, right) =>
                    (getManifestNamespace(left)?.name ?? '').localeCompare(
                        getManifestNamespace(right)?.name ?? '',
                    ) ||
                    left.name.localeCompare(right.name) ||
                    left.uniqueId.localeCompare(right.uniqueId),
            )
            .map((item) => {
                const namespace = getManifestNamespace(item);
                return `${itemType} "${item.name}"${
                    namespace
                        ? ` from ${namespace.kind} "${namespace.name}"`
                        : ''
                } (${item.uniqueId})`;
            });
        throw new ParameterError(
            `${collisionContext} ${itemType} name "${resolvedName}" is ambiguous after qualification: ${parties.slice(0, -1).join(', ')}${
                parties.length > 1 ? ' and ' : ''
            }${parties.at(-1)}. Rename the ${renameTarget} or ${itemType} before deploying.`,
        );
    }

    return resolvedNames;
};
