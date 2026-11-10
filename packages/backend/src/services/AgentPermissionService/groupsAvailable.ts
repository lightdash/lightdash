/**
 * Group-based AI agent permissions need a valid deployment licence. Groups
 * themselves are always available.
 */
export const areOrganizationGroupsAvailable = async ({
    isLicensed,
}: {
    isLicensed: () => boolean;
}): Promise<boolean> => isLicensed();
