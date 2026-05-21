export enum OrganizationAccessStatus {
    ACTIVE = 'active',
    TRIAL_WARNING = 'trial_warning',
    TRIAL_BLOCKED = 'trial_blocked',
}

export type OrganizationAccess =
    | {
          status: OrganizationAccessStatus.ACTIVE;
      }
    | {
          status: OrganizationAccessStatus.TRIAL_WARNING;
      }
    | {
          status: OrganizationAccessStatus.TRIAL_BLOCKED;
          apiCliBlocked: boolean;
      };

export type ApiOrganizationAccessResponse = {
    status: 'ok';
    results: OrganizationAccess;
};
