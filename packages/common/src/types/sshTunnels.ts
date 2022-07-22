export type SSHTunnelConfig = {
    host: string;
    port: number;
    username: string;
    publicKey: string;
};

export type SSHTunnelConfigSecrets = SSHTunnelConfig & {
    privateKey: string;
};

export const getSafeSSHTunnelConfig = (
    config: SSHTunnelConfigSecrets | undefined,
): SSHTunnelConfig | undefined =>
    config && {
        host: config.host,
        port: config.port,
        username: config.username,
        publicKey: config.publicKey,
    };

export type SSHKeypair = {
    publicKey: string;
    privateKey: string;
};
