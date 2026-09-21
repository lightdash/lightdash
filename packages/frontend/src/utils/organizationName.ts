export const inferOrganizationName = (domain: string): string =>
    (domain.split('.')[0] ?? '')
        .split(/[-_]/)
        .filter(Boolean)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
