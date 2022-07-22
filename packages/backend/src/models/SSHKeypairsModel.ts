import { generateOpenSSHKeyPair } from '@lightdash/warehouses';
import { Knex } from 'knex';
import { EncryptionService } from '../services/EncryptionService/EncryptionService';

type Dependencies = {
    database: Knex;
    encryptionService: EncryptionService;
};

export class SSHKeypairsModel {
    private database: Knex;

    private encryptionService: EncryptionService;

    constructor(dependencies: Dependencies) {
        this.database = dependencies.database;
        this.encryptionService = dependencies.encryptionService;
    }

    async create(): Promise<{ publicKey: string }> {
        const { publicKey, privateKey } = await generateOpenSSHKeyPair();
        const encryptedPrivateKey = await this.encryptionService.encrypt(
            privateKey,
        );
        await this.database('ssh_keypairs').insert({
            public_key: publicKey,
            encrypted_private_key: encryptedPrivateKey,
        });
        return {
            publicKey,
        };
    }
}
