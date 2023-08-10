import { CreateUserAttribute, UserAttribute } from '@lightdash/common';
import { Knex } from 'knex';
import { OrganizationTableName } from '../database/entities/organizations';
import {
    DbOrganizationMemberUserAttribute,
    DbUserAttribute,
    OrganizationMemberUserAttributesTable,
    UserAttributesTable,
} from '../database/entities/userAttributes';

type Dependencies = {
    database: Knex;
};

export class UserAttributesModel {
    private database: Knex;

    constructor(dependencies: Dependencies) {
        this.database = dependencies.database;
    }

    async find(filters: {
        organizationUuid?: string;
        userAttributeUuid?: string;
        userUuid?: string;
    }): Promise<UserAttribute[]> {
        const query = this.database(UserAttributesTable)
            .leftJoin(
                OrganizationMemberUserAttributesTable,
                `${OrganizationMemberUserAttributesTable}.user_attribute_uuid`,
                `${UserAttributesTable}.user_attribute_uuid`,
            )
            .leftJoin(
                `users`,
                `${OrganizationMemberUserAttributesTable}.user_id`,
                `users.user_id`,
            )
            .leftJoin(
                `emails`,
                `${OrganizationMemberUserAttributesTable}.user_id`,
                `emails.user_id`,
            )
            .leftJoin(
                `organizations`,
                `${UserAttributesTable}.organization_id`,
                `organizations.organization_id`,
            )
            .select<
                (DbUserAttribute &
                    DbOrganizationMemberUserAttribute & {
                        user_uuid: string;
                        email: string;
                        organization_uuid: string;
                    })[]
            >(
                `${UserAttributesTable}.*`,
                `${OrganizationMemberUserAttributesTable}.user_id`,
                `${OrganizationMemberUserAttributesTable}.value`,
                `emails.email`,
                `users.user_uuid`,
                `organizations.organization_uuid`,
            )
            .orderBy('created_at', 'desc');

        if (filters.organizationUuid) {
            query.where(
                `organizations.organization_uuid`,
                filters.organizationUuid,
            );
        }
        if (filters.userAttributeUuid) {
            query.where(
                `${UserAttributesTable}.user_attribute_uuid`,
                filters.userAttributeUuid,
            );
        }
        if (filters.userUuid) {
            query.where(`users.user_uuid`, filters.userUuid);
        }

        const orgAttributes = await query;

        const results = orgAttributes.reduce<Record<string, UserAttribute>>(
            (acc, orgAttribute) => {
                if (
                    acc[orgAttribute.user_attribute_uuid] &&
                    orgAttribute.user_id
                ) {
                    acc[orgAttribute.user_attribute_uuid].users.push({
                        userUuid: orgAttribute.user_uuid,
                        value: orgAttribute.value,
                        email: orgAttribute.email,
                    });
                    return acc;
                }
                return {
                    ...acc,
                    [orgAttribute.user_attribute_uuid]: {
                        uuid: orgAttribute.user_attribute_uuid,
                        createdAt: orgAttribute.created_at,
                        name: orgAttribute.name,
                        organizationUuid: orgAttribute.organization_uuid,
                        description: orgAttribute.description || undefined,
                        users: orgAttribute.user_id
                            ? [
                                  {
                                      userUuid: orgAttribute.user_uuid,
                                      value: orgAttribute.value,
                                      email: orgAttribute.email,
                                  },
                              ]
                            : [],
                    },
                };
            },
            {},
        );

        return Object.values(results);
    }

    async get(userAttributeUuid: string): Promise<UserAttribute> {
        const [result] = await this.find({ userAttributeUuid });
        return result;
    }

    private static async insertOrganizationMemberUserAttributes(
        trx: Knex.Transaction,
        userAttributeUuid: string,
        organizationId: number,
        users: { userUuid: string; value: string }[],
    ): Promise<void> {
        const promises = users.map(async (userAttr) => {
            const [user] = await trx(`users`)
                .where(`users.user_uuid`, userAttr.userUuid)
                .select('user_id');
            return trx(OrganizationMemberUserAttributesTable).insert({
                user_id: user.user_id,
                organization_id: organizationId,
                user_attribute_uuid: userAttributeUuid,
                value: userAttr.value,
            });
        });

        await Promise.all(promises);
    }

    async create(
        organizationUuid: string,
        orgAttribute: CreateUserAttribute,
    ): Promise<UserAttribute> {
        const [organization] = await this.database(OrganizationTableName)
            .select('organization_id')
            .where('organization_uuid', organizationUuid);

        const attributeUuid = await this.database.transaction(async (trx) => {
            const [inserted] = await trx(UserAttributesTable)
                .insert({
                    name: orgAttribute.name,
                    description: orgAttribute.description,
                    organization_id: organization.organization_id,
                })
                .returning('*');

            await UserAttributesModel.insertOrganizationMemberUserAttributes(
                trx,
                inserted.user_attribute_uuid,
                organization.organization_id,
                orgAttribute.users,
            );

            return inserted.user_attribute_uuid;
        });
        return this.get(attributeUuid);
    }

    async update(
        organizationUuid: string,
        orgAttributeUuid: string,
        orgAttribute: CreateUserAttribute,
    ): Promise<UserAttribute> {
        const [organization] = await this.database(OrganizationTableName)
            .select('organization_id')
            .where('organization_uuid', organizationUuid);

        // Delete all users,
        // Update the attribute
        // Add all users back in
        await this.database.transaction(async (trx) => {
            await trx
                .delete()
                .from(OrganizationMemberUserAttributesTable)
                .where('user_attribute_uuid', orgAttributeUuid)
                .andWhere('organization_id', organization.organization_id);

            await trx(UserAttributesTable)
                .update({
                    name: orgAttribute.name,
                    description: orgAttribute.description,
                })
                .where('user_attribute_uuid', orgAttributeUuid);

            await UserAttributesModel.insertOrganizationMemberUserAttributes(
                trx,
                orgAttributeUuid,
                organization.organization_id,
                orgAttribute.users,
            );
        });

        return this.get(orgAttributeUuid);
    }

    async delete(orgAttributeUuid: string): Promise<void> {
        await this.database(UserAttributesTable)
            .where('user_attribute_uuid', orgAttributeUuid)
            .delete();
    }
}
