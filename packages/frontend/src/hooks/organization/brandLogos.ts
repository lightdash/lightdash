import {
    isSquareBrandLogo,
    rankBrandLogos,
    type OrganizationBrandLogo,
} from '@lightdash/common';

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

export const findSquareBrandLogo = async (
    logos: OrganizationBrandLogo[],
    loadSize: typeof loadImageSize = loadImageSize,
): Promise<OrganizationBrandLogo | null> => {
    const ranked = rankBrandLogos(logos);
    const sizes = await Promise.all(
        ranked.map((logo) => loadSize(logo.url).catch(() => null)),
    );
    const index = sizes.findIndex(
        (size) => size !== null && isSquareBrandLogo(size.width, size.height),
    );
    return index === -1 ? null : ranked[index];
};
