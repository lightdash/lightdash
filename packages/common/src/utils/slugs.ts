const sanitizeSlug = (slug: string) =>
    slug
        .toLowerCase()
        // Then replace remaining non-alphanumeric characters with hyphens
        .replace(/[^a-z0-9]+/g, '-')
        // Replace multiple hyphens with a single hyphen
        .replace(/-+/g, '-')
        // Trim leading and trailing hyphens
        .replace(/^-+|-+$/g, '');

export const generateSlug = (name: string) => {
    const sanitizedSlug = sanitizeSlug(name);
    if (sanitizedSlug.length === 0) {
        // Return a random 5 character string
        // Base-36 uses all digits (0-9) and all letters (a-z)
        return Math.random().toString(36).substring(2, 7);
    }
    return sanitizedSlug;
};
