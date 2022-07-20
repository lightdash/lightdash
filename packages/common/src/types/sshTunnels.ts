export type SSHTunnelConfigIn = {
    host: string;
    port: number;
    username: string;
};

export type SSHTunnelConfigOut = SSHTunnelConfigIn & {
    publicKey: string;
};

export type SSHTunnelConfigSecrets = SSHTunnelConfigOut & {
    privateKey: string;
};
