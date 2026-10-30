import { type OrganizationBrandLogo } from '@lightdash/common';

const TYPE_PRIORITY = ['symbol', 'icon', 'logo'];

const rank = (values: string[], value: string | null) => {
    const index = value === null ? -1 : values.indexOf(value);
    return index === -1 ? values.length : index;
};

export const pickBrandLogo = (
    logos: OrganizationBrandLogo[],
): OrganizationBrandLogo | null => {
    const primary = logos.filter(
        (logo) => logo.theme === 'dark' || logo.theme === null,
    );
    return (
        [...(primary.length > 0 ? primary : logos)].sort(
            (a, b) =>
                rank(TYPE_PRIORITY, a.type) - rank(TYPE_PRIORITY, b.type) ||
                rank(['svg'], a.format) - rank(['svg'], b.format),
        )[0] ?? null
    );
};

export const loadImageSize = (
    url: string,
): Promise<{ width: number; height: number }> =>
    new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () =>
            resolve({ width: image.naturalWidth, height: image.naturalHeight });
        image.onerror = () => reject(new Error(`Failed to load ${url}`));
        image.src = url;
    });
