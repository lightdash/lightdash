const sanitizeSlug = (slug: string) =>
    slug
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-') // Replace all non-alphanumeric characters with hyphens
        .replace(/-+/g, '-') // Replace multiple hyphens with a single hyphen
        .replace(/^-+|-+$/g, ''); // Trim leading and trailing hyphens

export const generateSlug = (
    type: 'dashboards' | 'charts' | 'spaces',
    name: string,
    spaceName?: string,
) => {
    if (type === 'spaces') {
        return `spaces/${sanitizeSlug(name)}`;
    }
    if (!spaceName && type === 'charts') {
        // Charts in dashboards don't need a space name
        return `${type}/${sanitizeSlug(name)}`;
    }
    if (!spaceName)
        throw new Error('Space name is required for dashboards slugs');
    return `${type}/${sanitizeSlug(spaceName)}/${sanitizeSlug(name)}`;
};
