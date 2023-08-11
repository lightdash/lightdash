import { Knex } from 'knex';

type DbSshKeyPair = {
    private_key: Buffer;
    public_key: string;
};

export const SshKeyPairTableName = 'ssh_key_pairs';
export type SshKeyPairTable = Knex.CompositeTableType<
    DbSshKeyPair,
    DbSshKeyPair
>;
