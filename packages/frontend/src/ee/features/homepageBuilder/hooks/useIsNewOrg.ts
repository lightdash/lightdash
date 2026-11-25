import { useOrganization } from '../../../../hooks/organization/useOrganization';

const NEW_ORG_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

export const useIsNewOrg = () => {
    const organization = useOrganization();
    const createdAt = organization.data?.createdAt;
    return {
        isNewOrg:
            !!createdAt &&
            Date.now() - new Date(createdAt).getTime() < NEW_ORG_WINDOW_MS,
        isLoading: organization.isInitialLoading,
    };
};
