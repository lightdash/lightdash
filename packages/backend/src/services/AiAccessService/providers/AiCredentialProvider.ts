import {
    type AiAccessPolicy,
    type AiAssurance,
    type AiPrincipalWithSecrets,
    type AiProbeResult,
    type AiSetupScript,
    type AiWarehouseCapabilities,
    type CreateWarehouseCredentials,
} from '@lightdash/common';

export type AiCreatedSecret = {
    secret: string;
    publicKey: string | null;
    publicKeyFingerprint: string | null;
};

export type AiPrincipalPerson = {
    userUuid: string;
    email: string;
};

export type AiMintArgs<T extends CreateWarehouseCredentials> = {
    connection: T;
    principal: AiPrincipalWithSecrets;
    policy: AiAccessPolicy;
    person: AiPrincipalPerson;
};

export type AiMintedCredentials<T extends CreateWarehouseCredentials> = {
    credentials: T;
    assurances: AiAssurance[];
    expiresAt: Date | null;
};

export type AiSetupScriptArgs<T extends CreateWarehouseCredentials> = {
    connection: T;
    principal: AiPrincipalWithSecrets;
    policy: AiAccessPolicy;
};

/**
 * One provider per warehouse type. `mint` returns credentials that sign in
 * as the principal and the assurances a probe must prove before a query
 * runs. `probe` opens one session with those credentials, runs one small
 * query and compares it with the assurances. Providers never fetch query
 * results by warehouse query id; results reach Lightdash only through the
 * query the plan started.
 */
export interface AiCredentialProvider<
    T extends CreateWarehouseCredentials = CreateWarehouseCredentials,
> {
    readonly warehouseType: T['type'];

    capabilities(connection: T): AiWarehouseCapabilities;

    createSecret(): Promise<AiCreatedSecret | null>;

    mint(args: AiMintArgs<T>): Promise<AiMintedCredentials<T>>;

    probe(credentials: T, assurances: AiAssurance[]): Promise<AiProbeResult>;

    setupScript(args: AiSetupScriptArgs<T>): AiSetupScript;
}
