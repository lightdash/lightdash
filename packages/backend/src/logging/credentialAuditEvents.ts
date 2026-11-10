import {
    type CredentialOwnerKind,
    type CredentialPurpose,
    type WarehouseTypes,
} from '@lightdash/common';

export const credentialAuditEvents = [
    'credential.created',
    // Secrets change, identity stays the same, and generation changes.
    'credential.rotated',
    // Identity and generation change.
    'credential.replaced',
    'credential.deleted',
    'credential.bound',
    'credential.unbound',
    'credential.sign_in_expired',
] as const;

export type CredentialAuditEvent = (typeof credentialAuditEvents)[number];

export type CredentialAuditMetadata = {
    credentialUuid: string;
    organizationUuid: string;
    ownerKind: CredentialOwnerKind;
    purpose: CredentialPurpose;
    warehouseType: WarehouseTypes | null;
    authMode: string;
    projectUuid: string | null;
    warehouseConnectionUuid: string | null;
    subjectUserUuid: string | null;
    generationBefore: string | null;
    generationAfter: string | null;
};
