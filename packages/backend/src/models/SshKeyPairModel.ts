import { type SshKeyPair } from '@lightdash/common';
import { Knex } from 'knex';
import { generateOpenSshKeyPair } from '../utils';
import { type EncryptionUtil } from '../utils/EncryptionUtil/EncryptionUtil';

type SshKeyPairModelArguments = {
    encryptionUtil: EncryptionUtil;
    database: Knex;
};

export class SshKeyPairModel {
    private readonly database: Knex;

    private readonly encryptionUtil: EncryptionUtil;

    constructor({ encryptionUtil, database }: SshKeyPairModelArguments) {
        this.database = database;
        this.encryptionUtil = encryptionUtil;
    }

    async create(): Promise<SshKeyPair> {
        const { publicKey, privateKey } = await generateOpenSshKeyPair();
        const encryptedPrivateKey = this.encryptionUtil.encrypt(privateKey);
        await this.database('ssh_key_pairs').insert({
            public_key: publicKey,
            private_key: encryptedPrivateKey,
        });
        return {
            publicKey,
            privateKey,
        };
    }

    async get(publicKey: string): Promise<SshKeyPair> {
        const row = await this.database('ssh_key_pairs')
            .where({ public_key: publicKey })
            .first();
        if (row === undefined) {
            throw new Error('Public SSH Key not recognised');
        }
        const privateKey = this.encryptionUtil.decrypt(row.private_key);
        return {
            publicKey,
            privateKey,
        };
    }
}
