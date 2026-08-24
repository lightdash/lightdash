import { ParameterError } from '../types/errors';

type ManifestNamedItem = {
    uniqueId: string;
    name: string;
    sourceName?: string;
};

export const qualifyMergedManifestNames = (
    items: ManifestNamedItem[],
    itemType: 'model' | 'metric',
): Map<string, string> => {
    const sourceNamesByName = new Map<string, Set<string>>();
    items.forEach(({ name, sourceName }) => {
        if (sourceName === undefined) {
            return;
        }
        const sourceNames = sourceNamesByName.get(name) ?? new Set<string>();
        sourceNames.add(sourceName);
        sourceNamesByName.set(name, sourceNames);
    });

    const collidingNames = new Set(
        Array.from(sourceNamesByName)
            .filter(([, sourceNames]) => sourceNames.size > 1)
            .map(([name]) => name),
    );
    const resolvedNames = new Map(
        items.map((item) => [
            item.uniqueId,
            item.sourceName !== undefined && collidingNames.has(item.name)
                ? `${item.sourceName}__${item.name}`
                : item.name,
        ]),
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
        const parties = [...resolvedItems]
            .sort(
                (left, right) =>
                    (left.sourceName ?? '').localeCompare(
                        right.sourceName ?? '',
                    ) ||
                    left.name.localeCompare(right.name) ||
                    left.uniqueId.localeCompare(right.uniqueId),
            )
            .map(
                (item) =>
                    `${itemType} "${item.name}" from source "${item.sourceName}" (${item.uniqueId})`,
            );
        throw new ParameterError(
            `Merged dbt ${itemType} name "${resolvedName}" is ambiguous after qualification: ${parties.slice(0, -1).join(', ')}${
                parties.length > 1 ? ' and ' : ''
            }${parties.at(-1)}. Rename the source or ${itemType} before deploying.`,
        );
    }

    return resolvedNames;
};
