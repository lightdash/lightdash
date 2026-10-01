export type OrganizationSetupRole = 'creator' | 'joiner' | 'legacy';

export const getOrganizationSetupRole = ({
    isConnectJourney,
    userUuid,
    userOrganizationName,
    createdByUserUuid,
}: {
    isConnectJourney: boolean;
    userUuid: string | undefined;
    userOrganizationName: string | undefined;
    createdByUserUuid: string | null;
}): OrganizationSetupRole => {
    if (!isConnectJourney) return 'legacy';
    if (createdByUserUuid !== null) {
        return createdByUserUuid === userUuid ? 'creator' : 'joiner';
    }
    return userOrganizationName === '' ? 'creator' : 'joiner';
};
