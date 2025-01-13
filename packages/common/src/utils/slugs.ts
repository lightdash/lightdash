const sanitizeSlug = (slug: string) =>
    slug
        .toLowerCase()
        // First remove any emoji or special characters completely
        .replace(/[\u{1F300}-\u{1F9FF}]|[:]/gu, '')
        // Then replace remaining non-alphanumeric characters with hyphens
        .replace(/[^a-z0-9]+/g, '-')
        // Replace multiple hyphens with a single hyphen
        .replace(/-+/g, '-')
        // Trim leading and trailing hyphens
        .replace(/^-+|-+$/g, '');

export const generateSlug = (name: string) => `${sanitizeSlug(name)}`;
