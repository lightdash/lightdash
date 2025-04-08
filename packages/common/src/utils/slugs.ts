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

/**
 * Get all slugs with hierarchy for a given slug
 * For example, "parent-space/child-space" will return ["parent-space", "parent-space/child-space"]
 * @param slug - The slug to get the hierarchy for
 * @returns An array of slugs with hierarchy
 */
export const getSlugsWithHierarchy = (slug: string) =>
    slug.split('/').reduce<string[]>((acc, s) => {
        if (acc.length === 0) {
            return [s];
        }
        return [...acc, `${acc[acc.length - 1]}/${s}`];
    }, []);

/**
 * Get the parent slug from a slug with hierarchy
 * For example, "parent-space/child-space" will return "parent-space"
 * @param slug - The slug to get the parent slug from
 * @returns The parent slug
 */
export const getParentSlug = (slug: string) =>
    slug.split('/').slice(0, -1).join('/');

/**
 * Get the label from a slug with hierarchy
 * For example, "parent-space/child-space" will return "child-space"
 * @param slug - The slug to get the label from
 * @returns The label
 */
export const getLabelFromSlug = (slug: string) => slug.split('/').pop() ?? slug;
