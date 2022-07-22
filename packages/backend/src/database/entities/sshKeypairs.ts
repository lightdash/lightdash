import { Knex } from 'knex';

export const SSHKeypairsTableName = 'ssh_keypairs';

type DbSSHKeypair = {
    public_key: string;
    encrypted_private_key: Buffer;
};

export type SSHKeypairsTable = Knex.CompositeTableType<DbSSHKeypair>;
