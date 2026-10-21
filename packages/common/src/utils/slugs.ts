const sanitizeSlug = (slug: string, trimHyphens = true) => {
    let sanitizedSlug = slug
        .toLowerCase()
        // Then replace remaining non-alphanumeric characters with hyphens
        .replace(/[^a-z0-9]+/g, '-');

    if (trimHyphens) {
        // Trim leading and trailing hyphens
        sanitizedSlug = sanitizedSlug.replace(/^-+|-+$/g, '');
    }

    return sanitizedSlug;
};

// Content-as-code writes `<slug>.language.map.yml` and slug-update stages
// `<file>.slug-update-<pid>-<n>` renames, so a slug must leave room under the
// 255-byte file name limit that ext4, APFS and NTFS share.
export const MAX_CONTENT_SLUG_LENGTH = 200;

export const truncateSlug = (slug: string, maxLength: number) =>
    slug.slice(0, maxLength).replace(/-+$/, '');

export const generateSlug = (name: string) => {
    const sanitizedSlug = sanitizeSlug(name);
    if (sanitizedSlug.length === 0) {
        // Return a random 5 character string
        // Base-36 uses all digits (0-9) and all letters (a-z)
        return Math.random().toString(36).substring(2, 7);
    }
    return sanitizedSlug;
};

export const getLtreePathFromSlug = (slug: string) => {
    let path = slug;
    // This is for backwards compatibility with the old slug format that contained hierarchy
    if (path.includes('/')) {
        path = path.split('/').join('___');
    }

    return path.replace(/-/g, '_');
};

export const getLtreePathFromContentAsCodePath = (path: string) =>
    path.replace(/-/g, '_').replace(/\//g, '.');

export const getContentAsCodePathFromLtreePath = (path: string) =>
    path.replace(/_/g, '-').replace(/\./g, '/');

export const getDeepestPaths = (paths: string[]): string[] => {
    const uniquePaths = Array.from(new Set(paths));
    const result: string[] = [];

    for (const path of uniquePaths) {
        const pathSegments = path.split('.');

        const isPrefix = uniquePaths.some((otherPath) => {
            if (path === otherPath) return false;

            const otherSegments = otherPath.split('.');

            if (pathSegments.length < otherSegments.length) {
                const potentialPrefix = otherSegments
                    .slice(0, pathSegments.length)
                    .join('.');
                return potentialPrefix === path;
            }

            return false;
        });

        if (!isPrefix) {
            result.push(path);
        }
    }

    return result;
};

export const isSubPath = (path: string, subPath: string) =>
    subPath.startsWith(path) && subPath[path.length] === '.';
