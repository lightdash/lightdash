import { pickBrandLogo } from '@lightdash/common';
import useIsEmbedded from '../../ee/providers/Embed/useIsEmbedded';
import useApp from '../../providers/App/useApp';
import { useOrganizationBrand } from './useOrganizationBrand';

// The organization brand wins when signed in, then the instance brand
export const useWhiteLabelBrand = (): {
    logoUrl: string | null;
    name: string | null;
    isResolved: boolean;
} => {
    const { health, user } = useApp();
    const isEmbedded = useIsEmbedded();
    const canUseBrand =
        !!health.data?.license?.valid && health.data.isAuthenticated;
    const enabled = canUseBrand && !!user.data?.organizationUuid && !isEmbedded;
    const { data, isError } = useOrganizationBrand({ enabled });
    const isResolved =
        health.isError ||
        (!!health.data &&
            (!canUseBrand ||
                user.isError ||
                (!!user.data && (!enabled || isError || data !== undefined))));

    const brand = enabled && !isError ? (data ?? null) : null;
    const instanceBrand = isEmbedded
        ? null
        : (health.data?.instanceBrand ?? null);

    return {
        logoUrl:
            (brand ? pickBrandLogo(brand.logos)?.url : null) ??
            instanceBrand?.logoUrl ??
            null,
        name: brand?.name?.trim() || instanceBrand?.name || null,
        isResolved,
    };
};
