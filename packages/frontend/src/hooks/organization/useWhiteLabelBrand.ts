import { type OrganizationBrand } from '@lightdash/common';
import useIsEmbedded from '../../ee/providers/Embed/useIsEmbedded';
import useApp from '../../providers/App/useApp';
import { useOrganizationBrand } from './useOrganizationBrand';

export const useWhiteLabelBrand = (): {
    brand: OrganizationBrand | null;
    isResolved: boolean;
} => {
    const { health, user } = useApp();
    const isEmbedded = useIsEmbedded();
    const canUseBrand =
        !!health.data?.license?.valid && health.data.isAuthenticated;
    const enabled = canUseBrand && !!user.data?.organizationUuid && !isEmbedded;
    const { data, isError } = useOrganizationBrand({ enabled });
    const isResolved =
        !!health.data &&
        (!canUseBrand ||
            (!!user.data && (!enabled || isError || data !== undefined)));

    return {
        brand: enabled && !isError ? (data ?? null) : null,
        isResolved,
    };
};
