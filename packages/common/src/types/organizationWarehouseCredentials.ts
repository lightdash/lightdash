import type {
    CreateWarehouseCredentials,
    WarehouseCredentials,
    WarehouseTypes,
} from './projects';

/**
 * Organization-level warehouse credentials
 */
export type OrganizationWarehouseCredentials = {
    organizationWarehouseCredentialsUuid: string;
    organizationUuid: string;
    name: string;
    description: string | null;
    warehouseType: WarehouseTypes;
    createdAt: Date;
    createdByUserUuid: string | null;
    credentials: WarehouseCredentials; // Non-sensitive credentials only (WarehouseCredentials = Omit<CreateWarehouseCredentials, SensitiveCredentialsFieldNames>)
};

export type CreateOrganizationWarehouseCredentials = {
    name: string;
    description?: string | null;
    credentials: CreateWarehouseCredentials;
};

export type UpdateOrganizationWarehouseCredentials = {
    name?: string;
    description?: string | null;
    credentials?: CreateWarehouseCredentials;
};

export type ApiOrganizationWarehouseCredentialsResponse = {
    status: 'ok';
    results: OrganizationWarehouseCredentials;
};

export type ApiOrganizationWarehouseCredentialsListResponse = {
    status: 'ok';
    results: OrganizationWarehouseCredentials[];
};

export type OrganizationWarehouseCredentialsSummary = Pick<
    OrganizationWarehouseCredentials,
    | 'organizationWarehouseCredentialsUuid'
    | 'name'
    | 'description'
    | 'warehouseType'
>;

export type ApiOrganizationWarehouseCredentialsSummaryListResponse = {
    status: 'ok';
    results: OrganizationWarehouseCredentialsSummary[];
};
