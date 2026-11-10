import { type SshKeyPair } from '@lightdash/common';
import { Knex } from 'knex';
import { SshKeyPairTableName } from '../database/entities/sshKeyPairs';
import { generateOpenSshKeyPair } from '../utils';
import { type EncryptionUtil } from '../utils/EncryptionUtil/EncryptionUtil';

type SshKeyPairModelArguments = {
    encryptionUtil: EncryptionUtil;
    database: Knex;
};

export type SshKeyPairWithOwner = SshKeyPair & {
    organizationUuid: string | null;
};

export class SshKeyPairModel {
    private readonly database: Knex;

    private readonly encryptionUtil: EncryptionUtil;

    constructor({ encryptionUtil, database }: SshKeyPairModelArguments) {
        this.database = database;
        this.encryptionUtil = encryptionUtil;
    }

    async create(organizationUuid: string): Promise<SshKeyPair> {
        const { publicKey, privateKey } = await generateOpenSshKeyPair();
        const encryptedPrivateKey = this.encryptionUtil.encrypt(privateKey);
        await this.database(SshKeyPairTableName).insert({
            public_key: publicKey,
            private_key: encryptedPrivateKey,
            organization_uuid: organizationUuid,
        });
        return {
            publicKey,
            privateKey,
        };
    }

    async find(publicKey: string): Promise<SshKeyPairWithOwner | null> {
        const row = await this.database(SshKeyPairTableName)
            .where({ public_key: publicKey })
            .first();
        if (row === undefined) {
            return null;
        }
        const privateKey = this.encryptionUtil.decrypt(row.private_key);
        return {
            publicKey,
            privateKey,
            organizationUuid: row.organization_uuid,
        };
    }
}
