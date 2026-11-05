import { type DbtManifest, type DbtRawModelNode } from '../types/dbt';
import { DbtManifestTextError, DbtModelTextError } from '../types/errors';

const findNulPath = (value: unknown, path: string): string | null => {
    if (typeof value === 'string')
        return value.includes('\u0000') ? path : null;
    if (value === null || typeof value !== 'object') return null;
    return Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .reduce<string | null>(
            (found, [key, child]) =>
                found ??
                (key.includes('\u0000')
                    ? `${path}[invalid-key]`
                    : findNulPath(child, `${path}.${key}`)),
            null,
        );
};

const safeIdentity = (value: unknown): string =>
    typeof value === 'string' && !value.includes('\u0000')
        ? value
        : '[unavailable]';

export const getDbtModelTextError = (
    model: DbtRawModelNode,
): DbtModelTextError | null => {
    const path = findNulPath(model, 'model');
    return path === null
        ? null
        : new DbtModelTextError(
              `Source "${safeIdentity(model.lightdash_source_name ?? model.package_name)}", model "${safeIdentity(model.unique_id)}": U+0000 is not supported at ${path}.`,
          );
};

export const assertValidDbtModelIdentifiers = (
    model: DbtRawModelNode,
    sourceName?: string,
): void => {
    const missingIdentity = ['name', 'unique_id', 'package_name'].find(
        (field) => {
            const value = model[field as 'name' | 'unique_id' | 'package_name'];
            return typeof value !== 'string' || value.length === 0;
        },
    );
    if (missingIdentity !== undefined && findNulPath(model, 'model') !== null)
        throw new DbtManifestTextError(
            `Source "${safeIdentity(sourceName ?? model.lightdash_source_name ?? model.package_name)}", model "${safeIdentity(model.unique_id)}": model identity is invalid at model.${missingIdentity}.`,
        );
    const path = findNulPath(
        {
            name: model.name,
            unique_id: model.unique_id,
            package_name: model.package_name,
            lightdash_source_name: model.lightdash_source_name,
            lightdash_source_uuid: model.lightdash_source_uuid,
            version: model.version,
            latest_version: model.latest_version,
        },
        'model',
    );
    if (path !== null)
        throw new DbtManifestTextError(
            `Source "${safeIdentity(sourceName ?? model.lightdash_source_name ?? model.package_name)}", model "${safeIdentity(model.unique_id)}": U+0000 is not supported at ${path}.`,
        );
};

export const assertValidDbtManifestIdentifiers = (
    manifest: DbtManifest,
    sourceName?: string,
): void => {
    const { nodes, disabled, ...sourceFields } = manifest;
    const sourcePath = findNulPath(sourceFields, 'manifest');
    if (sourcePath !== null)
        throw new DbtManifestTextError(
            `Source "${safeIdentity(sourceName)}": U+0000 is not supported at ${sourcePath}.`,
        );
    const entries = [
        ...Object.entries(nodes),
        ...Object.entries(disabled ?? {}).flatMap(([key, models]) =>
            models.map((model) => [key, model] as const),
        ),
    ];
    entries.forEach(([key, node]) => {
        const model = node as DbtRawModelNode;
        if (['model', 'seed'].includes(node.resource_type))
            assertValidDbtModelIdentifiers(model, sourceName);
        let path: string | null = null;
        if (key.includes('\u0000')) path = 'manifest.nodes[invalid-key]';
        else if (!['model', 'seed'].includes(node.resource_type))
            path = findNulPath(node, 'manifest.nodes');
        if (path !== null)
            throw new DbtManifestTextError(
                `Source "${safeIdentity(sourceName ?? model.lightdash_source_name ?? model.package_name)}", model "${safeIdentity(model.unique_id)}": U+0000 is not supported at ${path}.`,
            );
    });
};
