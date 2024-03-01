import { SshKeyPair } from '@lightdash/common';
import { generateKeyPair } from 'crypto';
import { Knex } from 'knex';
import { parseKey } from 'sshpk';
import { EncryptionService } from '../services/EncryptionService/EncryptionService';

type SshKeyPairModelArguments = {
    encryptionService: EncryptionService;
    database: Knex;
};

const generateOpenSshKeyPair = async (): Promise<SshKeyPair> =>
    new Promise<SshKeyPair>((resolve, reject) => {
        generateKeyPair(
            'rsa',
            {
                modulusLength: 4096,
                publicKeyEncoding: {
                    type: 'pkcs1',
                    format: 'pem',
                },
                privateKeyEncoding: {
                    type: 'pkcs1',
                    format: 'pem',
                },
            },
            (err, publicKey, privateKey) => {
                if (err) {
                    reject(err);
                } else {
                    const parsedPublicKey = parseKey(publicKey, 'pem');
                    parsedPublicKey.comment = `(generated_by_lightdash_at_${new Date().toISOString()})`;
                    const openSshPublicKey = parsedPublicKey.toString('ssh');
                    resolve({
                        publicKey: openSshPublicKey,
                        privateKey,
                    });
                }
            },
        );
    });

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
