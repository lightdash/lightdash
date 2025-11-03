import {
    CreateOrganizationWarehouseCredentials,
    CreateWarehouseCredentials,
    NotFoundError,
    OrganizationWarehouseCredentials,
    sensitiveCredentialsFieldNames,
    UnexpectedServerError,
    UpdateOrganizationWarehouseCredentials,
    WarehouseCredentials,
    WarehouseTypes,
} from '@lightdash/common';
import { Knex } from 'knex';
import {
    DbOrganizationWarehouseCredentials,
    OrganizationWarehouseCredentialsTableName,
} from '../database/entities/organizationWarehouseCredentials';
import { EncryptionUtil } from '../utils/EncryptionUtil/EncryptionUtil';

type OrganizationWarehouseCredentialsModelArguments = {
    database: Knex;
    encryptionUtil: EncryptionUtil;
};

export class OrganizationWarehouseCredentialsModel {
    private readonly database: Knex;

    private readonly encryptionUtil: EncryptionUtil;

    constructor(args: OrganizationWarehouseCredentialsModelArguments) {
        this.database = args.database;
        this.encryptionUtil = args.encryptionUtil;
    }

    private static stringifyCredentials(
        credentials: CreateWarehouseCredentials,
    ): string {
        return JSON.stringify(credentials);
    }

    // eslint-disable-next-line class-methods-use-this
    private stripSensitiveCredentials(
        credentials: CreateWarehouseCredentials,
    ): WarehouseCredentials {
        const strippedCredentials: Record<string, unknown> = { ...credentials };
        sensitiveCredentialsFieldNames.forEach((field) => {
            delete strippedCredentials[field];
        });
        return strippedCredentials as WarehouseCredentials;
    }

    // eslint-disable-next-line class-methods-use-this
    private convertToOrganizationWarehouseCredentials(
        data: DbOrganizationWarehouseCredentials & {
            organization_uuid: string;
        },
    ): OrganizationWarehouseCredentials {
        const fullCredentials = JSON.parse(
            this.encryptionUtil.decrypt(data.warehouse_connection),
        ) as CreateWarehouseCredentials;

        return {
            organizationWarehouseCredentialsUuid:
                data.organization_warehouse_credentials_uuid,
            organizationUuid: data.organization_uuid,
            name: data.name,
            description: data.description,
            warehouseType: data.warehouse_type as WarehouseTypes,
            createdAt: data.created_at,
            createdByUserUuid: data.created_by_user_uuid,
            credentials: this.stripSensitiveCredentials(fullCredentials),
        } as OrganizationWarehouseCredentials;
    }

    async getAllByOrganizationUuid(
        organizationUuid: string,
    ): Promise<OrganizationWarehouseCredentials[]> {
        const rows = await this.database(
            OrganizationWarehouseCredentialsTableName,
        )
            .where('organization_uuid', organizationUuid)
            .orderBy('created_at', 'desc');

        return rows.map((r) =>
            this.convertToOrganizationWarehouseCredentials(r),
        );
    }

    private async _getByUuid(
        uuid: string,
        withSensitiveData: boolean,
    ): Promise<
        | OrganizationWarehouseCredentials
        | (Omit<OrganizationWarehouseCredentials, 'credentials'> & {
              credentials: CreateWarehouseCredentials;
          })
    > {
        const result = await this.database(
            OrganizationWarehouseCredentialsTableName,
        )
            .where('organization_warehouse_credentials_uuid', uuid)
            .first();

        if (!result) {
            throw new NotFoundError(
                'Organization warehouse credentials not found',
            );
        }

        if (withSensitiveData) {
            const baseData =
                this.convertToOrganizationWarehouseCredentials(result);
            return {
                ...baseData,
                credentials: JSON.parse(
                    this.encryptionUtil.decrypt(result.warehouse_connection),
                ) as CreateWarehouseCredentials,
            };
        }

        return this.convertToOrganizationWarehouseCredentials(result);
    }

    async getByUuid(uuid: string): Promise<OrganizationWarehouseCredentials> {
        return this._getByUuid(uuid, false);
    }

    async getByUuidWithSensitiveData(uuid: string): Promise<
        Omit<OrganizationWarehouseCredentials, 'credentials'> & {
            credentials: CreateWarehouseCredentials;
        }
    > {
        return this._getByUuid(uuid, true) as Promise<
            Omit<OrganizationWarehouseCredentials, 'credentials'> & {
                credentials: CreateWarehouseCredentials;
            }
        >;
    }

    private async _getByName(
        organizationUuid: string,
        name: string,
        withSensitiveData: boolean,
    ): Promise<
        | OrganizationWarehouseCredentials
        | (Omit<OrganizationWarehouseCredentials, 'credentials'> & {
              credentials: CreateWarehouseCredentials;
          })
    > {
        const result = await this.database(
            OrganizationWarehouseCredentialsTableName,
        )
            .where('organization_uuid', organizationUuid)
            .where('name', name)
            .first();

        if (!result) {
            throw new NotFoundError(
                `Organization warehouse credentials with name "${name}" not found`,
            );
        }

        if (withSensitiveData) {
            const baseData =
                this.convertToOrganizationWarehouseCredentials(result);
            return {
                ...baseData,
                credentials: JSON.parse(
                    this.encryptionUtil.decrypt(result.warehouse_connection),
                ) as CreateWarehouseCredentials,
            };
        }

        return this.convertToOrganizationWarehouseCredentials(result);
    }

    async getByName(
        organizationUuid: string,
        name: string,
    ): Promise<OrganizationWarehouseCredentials> {
        return this._getByName(organizationUuid, name, false);
    }

    async getByNameWithSensitiveData(
        organizationUuid: string,
        name: string,
    ): Promise<
        Omit<OrganizationWarehouseCredentials, 'credentials'> & {
            credentials: CreateWarehouseCredentials;
        }
    > {
        return this._getByName(organizationUuid, name, true) as Promise<
            Omit<OrganizationWarehouseCredentials, 'credentials'> & {
                credentials: CreateWarehouseCredentials;
            }
        >;
    }

    async create(
        organizationUuid: string,
        data: CreateOrganizationWarehouseCredentials,
        createdByUserUuid: string | null,
    ): Promise<OrganizationWarehouseCredentials> {
        const encryptedCredentials = this.encryptionUtil.encrypt(
            OrganizationWarehouseCredentialsModel.stringifyCredentials(
                data.credentials,
            ),
        );

        const [result] = await this.database(
            OrganizationWarehouseCredentialsTableName,
        )
            .insert({
                organization_uuid: organizationUuid,
                name: data.name,
                description: data.description ?? null,
                warehouse_type: data.credentials.type,
                warehouse_connection: encryptedCredentials,
                created_by_user_uuid: createdByUserUuid,
            })
            .returning('*');

        return this.convertToOrganizationWarehouseCredentials(result);
    }

    async update(
        uuid: string,
        data: UpdateOrganizationWarehouseCredentials,
    ): Promise<OrganizationWarehouseCredentials> {
        const existing = await this.database(
            OrganizationWarehouseCredentialsTableName,
        )
            .select('*')
            .where('organization_warehouse_credentials_uuid', uuid)
            .first();

        if (!existing) {
            throw new NotFoundError(
                'Organization warehouse credentials not found',
            );
        }

        const updateData: Partial<DbOrganizationWarehouseCredentials> = {};

        if (data.name !== undefined) {
            updateData.name = data.name;
        }

        if (data.description !== undefined) {
            updateData.description = data.description;
        }

        if (data.credentials) {
            updateData.warehouse_type = data.credentials.type;
            updateData.warehouse_connection = this.encryptionUtil.encrypt(
                OrganizationWarehouseCredentialsModel.stringifyCredentials(
                    data.credentials,
                ),
            );
        }

        const [updated] = await this.database(
            OrganizationWarehouseCredentialsTableName,
        )
            .update(updateData)
            .where('organization_warehouse_credentials_uuid', uuid)
            .returning('*');

        return this.getByUuid(uuid);
    }

    async delete(uuid: string): Promise<void> {
        const deleted = await this.database(
            OrganizationWarehouseCredentialsTableName,
        )
            .where('organization_warehouse_credentials_uuid', uuid)
            .delete();

        if (deleted === 0) {
            throw new NotFoundError(
                'Organization warehouse credentials not found',
            );
        }
    }
}
