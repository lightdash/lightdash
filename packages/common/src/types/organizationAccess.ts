export enum OrganizationAccessStatus {
    ACTIVE = 'active',
    TRIAL_WARNING = 'trial_warning',
}

export type OrganizationAccess =
    | {
          status: OrganizationAccessStatus.ACTIVE;
      }
    | {
          status: OrganizationAccessStatus.TRIAL_WARNING;
      };

export type ApiOrganizationAccessResponse = {
    status: 'ok';
    results: OrganizationAccess;
};
