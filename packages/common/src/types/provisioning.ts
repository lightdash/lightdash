import { type ApiSuccess } from './api/success';

export const PROVISIONING_MAX_TOKEN_AGE_SECONDS = 300;

export type ProvisionOrganizationRequest = {
    organizationName: string;
    ownerEmail: string;
    ownerPassword: string;
};

export type ProvisionedOrganization = {
    organizationUuid: string;
    userUuid: string;
};

export type ApiProvisionOrganizationResponse =
    ApiSuccess<ProvisionedOrganization>;
