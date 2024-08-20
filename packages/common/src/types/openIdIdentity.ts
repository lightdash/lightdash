export enum OpenIdIdentityIssuerType {
    GOOGLE = 'google',
    OKTA = 'okta',
    ONELOGIN = 'oneLogin',
    AZUREAD = 'azuread',
    GENERIC_OIDC = 'oidc',
}

export const isOpenIdIdentityIssuerType = (
    value: string,
): value is OpenIdIdentityIssuerType =>
    Object.values(OpenIdIdentityIssuerType).includes(
        value as OpenIdIdentityIssuerType,
    );

export type CreateOpenIdIdentity = {
    subject: string;
    issuer: string;
    issuerType: OpenIdIdentityIssuerType;
    userId: number;
    email: string;
    refreshToken?: string; // Used in google to access google drive files
};

export type UpdateOpenIdentity = Pick<
    CreateOpenIdIdentity,
    'subject' | 'issuer' | 'email' | 'issuerType' | 'refreshToken'
>;

export type OpenIdIdentity = Omit<CreateOpenIdIdentity, 'userId'> & {
    userUuid: string;
    createdAt: Date;
};

export type OpenIdIdentitySummary = Pick<
    OpenIdIdentity,
    'issuer' | 'email' | 'createdAt' | 'issuerType'
>;

export type DeleteOpenIdentity = Pick<
    OpenIdIdentitySummary,
    'issuer' | 'email'
>;
