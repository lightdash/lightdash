export enum OrganizationAccessStatus {
    ACTIVE = 'active',
    TRIAL_WARNING = 'trial_warning',
    TRIAL_EXPIRED = 'trial_expired',
}

export type OrganizationAccess =
    | {
          status: OrganizationAccessStatus.ACTIVE;
      }
    | {
          status: OrganizationAccessStatus.TRIAL_WARNING;
      }
    | {
          status: OrganizationAccessStatus.TRIAL_EXPIRED;
      };

export type ApiOrganizationAccessResponse = {
    status: 'ok';
    results: OrganizationAccess;
};
