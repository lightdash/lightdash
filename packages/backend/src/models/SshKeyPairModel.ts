import { type SshKeyPair } from '@lightdash/common';
import { Knex } from 'knex';
import { type EncryptionService } from '../services/EncryptionService/EncryptionService';
import { generateOpenSshKeyPair } from '../utils';

type SshKeyPairModelArguments = {
    encryptionService: EncryptionService;
    database: Knex;
};

export class SshKeyPairModel {
    private readonly database: Knex;

    private readonly encryptionService: EncryptionService;

    constructor({ encryptionService, database }: SshKeyPairModelArguments) {
        this.database = database;
        this.encryptionService = encryptionService;
    }

    async create(): Promise<SshKeyPair> {
        const { publicKey, privateKey } = await generateOpenSshKeyPair();
        const encryptedPrivateKey = this.encryptionService.encrypt(privateKey);
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
        const privateKey = this.encryptionService.decrypt(row.private_key);
        return {
            publicKey,
            privateKey,
        };
    }
}
