export type SshKeyPair = {
    privateKey: string;
    publicKey: string;
};

export type ApiSshKeyPairResponse = {
    status: 'ok';
    results: Pick<SshKeyPair, 'publicKey'>;
};
