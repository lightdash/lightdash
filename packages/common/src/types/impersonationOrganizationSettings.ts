import { type ApiSuccess } from './api/success';

export type ImpersonationOrganizationSettings = {
    organizationUuid: string;
    impersonationEnabled: boolean;
};

export type UpdateImpersonationOrganizationSettings = {
    impersonationEnabled: boolean;
};

export type ApiImpersonationOrganizationSettingsResponse =
    ApiSuccess<ImpersonationOrganizationSettings>;
