/** Derive a stable, code-safe alias from a connection name. */
export const aliasFromName = (name: string): string =>
    name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');

export const uniqueAliasFromName = (
    name: string,
    existingAliases: string[],
): string => {
    const base = aliasFromName(name).slice(0, 64) || 'connection';
    const aliases = new Set(existingAliases);
    if (!aliases.has(base)) return base;

    let index = 2;
    while (
        aliases.has(`${base.slice(0, 64 - `${index}`.length - 1)}_${index}`)
    ) {
        index += 1;
    }
    const suffix = `_${index}`;
    return `${base.slice(0, 64 - suffix.length)}${suffix}`;
};
