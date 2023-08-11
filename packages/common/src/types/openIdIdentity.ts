export enum OpenIdIdentityIssuerType {
    GOOGLE = 'google',
    OKTA = 'okta',
    ONELOGIN = 'oneLogin',
    AZUREAD = 'azuread',
}

export type CreateOpenIdIdentity = {
    subject: string;
    issuer: string;
    issuerType: OpenIdIdentityIssuerType;
    userId: number;
    email: string;
};

export type UpdateOpenIdentity = Pick<
    CreateOpenIdIdentity,
    'subject' | 'issuer' | 'email' | 'issuerType'
>;

export type OpenIdIdentity = CreateOpenIdIdentity & {
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
