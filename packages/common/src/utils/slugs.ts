const sanitizeSlug = (slug: string) =>
    slug
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-') // Replace all non-alphanumeric characters with hyphens
        .replace(/-+/g, '-') // Replace multiple hyphens with a single hyphen
        .replace(/^-+|-+$/g, ''); // Trim leading and trailing hyphens

export const generateSlug = (name: string) => `${sanitizeSlug(name)}`;
