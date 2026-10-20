import { subject } from '@casl/ability';
import { type UserWithAbility } from '../user/useUser';
import { type SettingsContext } from './types';

type OrganizationAdoptionAccess = Pick<
    SettingsContext,
    'isOrganizationAdoptionEnabled' | 'organization'
> & {
    isLicenseValid: boolean;
    ability: UserWithAbility['ability'] | undefined;
};

// The API is only registered behind a valid enterprise licence, so the entry and routes need one too
export const canAccessOrganizationAdoption = ({
    isLicenseValid,
    isOrganizationAdoptionEnabled,
    organization,
    ability,
}: OrganizationAdoptionAccess): boolean =>
    isLicenseValid &&
    isOrganizationAdoptionEnabled &&
    (ability?.can(
        'view',
        subject('OrganizationAdoption', {
            organizationUuid: organization?.organizationUuid,
        }),
    ) ??
        false);
