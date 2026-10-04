import { Knex } from 'knex';

export type DbSshKeyPair = {
    private_key: Buffer;
    public_key: string;
    organization_uuid: string | null;
    created_at: Date | null;
};

type DbSshKeyPairIn = Pick<
    DbSshKeyPair,
    'private_key' | 'public_key' | 'organization_uuid'
>;

export const SshKeyPairTableName = 'ssh_key_pairs';
export type SshKeyPairTable = Knex.CompositeTableType<
    DbSshKeyPair,
    DbSshKeyPairIn
>;
