import {
    CreateUserWarehouseCredentials,
    UnexpectedServerError,
} from '@lightdash/common';
import { Knex } from 'knex';
import { UserWarehouseCredentialsTableName } from '../../database/entities/userWarehouseCredentials';
import { EncryptionService } from '../../services/EncryptionService/EncryptionService';

type ModelDependencies = {
    database: Knex;
    encryptionService: EncryptionService;
};

export class UserWarehouseCredentialsModel {
    private database: Knex;

    private encryptionService: EncryptionService;

    constructor(deps: ModelDependencies) {
        this.database = deps.database;
        this.encryptionService = deps.encryptionService;
    }

    // async getAllByUserUuid(userUuid: string): Promise<UserWarehouseCredentials[]> {
    // TODO
    // }

    // getForProject(projectUuid: string) {
    // TODO:
    // }

    async create(
        userUuid: string,
        data: CreateUserWarehouseCredentials,
    ): Promise<string | undefined> {
        let encryptedCredentials: Buffer;
        try {
            encryptedCredentials = this.encryptionService.encrypt(
                JSON.stringify(data.credentials),
            );
        } catch (e) {
            throw new UnexpectedServerError('Could not save credentials.');
        }
        const result = await this.database(UserWarehouseCredentialsTableName)
            .insert({
                user_uuid: userUuid,
                name: data.name,
                warehouse_type: data.credentials.type,
                encrypted_credentials: encryptedCredentials,
            })
            .returning('*')
            .first();

        if (!result) {
            throw new UnexpectedServerError('Could not save credentials.');
        }
        return result.user_warehouse_credentials_uuid;
    }

    // async update(): Promise<string> {
    // TODO
    // }
    //
    // async delete(): Promise<void> {
    // TODO
    // }
}
