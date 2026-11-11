import { type ApiSuccess } from './api/success';

export const PROVISIONING_MAX_TOKEN_AGE_SECONDS = 300;

export const PROVISIONED_TOKEN_LIFETIME_DAYS = 90;

export type ProvisionOrganizationRequest = {
    organizationName: string;
    ownerEmail: string;
};

export type ProvisionedOrganization = {
    organizationUuid: string;
    userUuid: string;
    token: string;
    tokenExpiresAt: Date;
};

export type ApiProvisionOrganizationResponse =
    ApiSuccess<ProvisionedOrganization>;
