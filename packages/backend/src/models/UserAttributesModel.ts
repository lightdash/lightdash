import {
    CreateUserAttribute,
    getAttributeDefaultValues,
    getUserAttributeValues,
    UserAttribute,
    UserAttributeValueMap,
} from '@lightdash/common';
import { Knex } from 'knex';
import { GroupMembershipTableName } from '../database/entities/groupMemberships';
import { GroupTableName } from '../database/entities/groups';
import { OrganizationTableName } from '../database/entities/organizations';
import {
    DbGroupUserAttribute,
    DbOrganizationMemberUserAttribute,
    DbUserAttribute,
    GroupUserAttributesTable,
    OrganizationMemberUserAttributesTable,
    UserAttributesTable,
} from '../database/entities/userAttributes';
import { UserTableName } from '../database/entities/users';

type UserAttributesModelArguments = {
    database: Knex;
};

export class UserAttributesModel {
    private database: Knex;

    constructor(args: UserAttributesModelArguments) {
        this.database = args.database;
    }

    async getAttributeValuesForOrgMember(filters: {
        organizationUuid: string;
        userUuid: string;
    }): Promise<UserAttributeValueMap> {
        // Run org defaults and user overrides in parallel (both independent)
        const [attributeValues, userValues] = await Promise.all([
            this.database(UserAttributesTable)
                .leftJoin(
                    OrganizationTableName,
                    `${UserAttributesTable}.organization_id`,
                    `${OrganizationTableName}.organization_id`,
                )
                .select<
                    Array<
                        Pick<
                            DbUserAttribute,
                            | 'name'
                            | 'attribute_defaults'
                            | 'user_attribute_uuid'
                        >
                    >
                >(
                    `${UserAttributesTable}.user_attribute_uuid`,
                    `${UserAttributesTable}.name`,
                    `${UserAttributesTable}.attribute_defaults`,
                )
                .where(
                    `${OrganizationTableName}.organization_uuid`,
                    filters.organizationUuid,
                ),
            this.database(OrganizationMemberUserAttributesTable)
                .leftJoin(
                    UserTableName,
                    `${OrganizationMemberUserAttributesTable}.user_id`,
                    `${UserTableName}.user_id`,
                )
                .leftJoin(
                    OrganizationTableName,
                    `${OrganizationMemberUserAttributesTable}.organization_id`,
                    `${OrganizationTableName}.organization_id`,
                )
                .leftJoin(
                    UserAttributesTable,
                    `${OrganizationMemberUserAttributesTable}.user_attribute_uuid`,
                    `${UserAttributesTable}.user_attribute_uuid`,
                )
                .select<
                    Array<
                        Pick<DbUserAttribute, 'name'> &
                            Pick<DbOrganizationMemberUserAttribute, 'values'>
                    >
                >(
                    `${UserAttributesTable}.name`,
                    `${OrganizationMemberUserAttributesTable}.values`,
                )
                .where(
                    `${OrganizationTableName}.organization_uuid`,
                    filters.organizationUuid,
                )
                .where(`${UserTableName}.user_uuid`, filters.userUuid),
        ]);

        const userValuesMap = userValues.reduce<Record<string, string[]>>(
            (acc, row) => ({ ...acc, [row.name]: row.values }),
            {},
        );

        // Group attrs depend on org defaults result for the whereIn filter
        const groupsValues = await this.database(GroupUserAttributesTable)
            .leftJoin(
                GroupTableName,
                `${GroupUserAttributesTable}.group_uuid`,
                `${GroupTableName}.group_uuid`,
            )
            .leftJoin(
                GroupMembershipTableName,
                `${GroupTableName}.group_uuid`,
                `${GroupMembershipTableName}.group_uuid`,
            )
            .leftJoin(
                OrganizationTableName,
                `${GroupTableName}.organization_id`,
                `${OrganizationTableName}.organization_id`,
            )
            .leftJoin(
                UserTableName,
                `${GroupMembershipTableName}.user_id`,
                `${UserTableName}.user_id`,
            )
            .leftJoin(
                UserAttributesTable,
                `${GroupUserAttributesTable}.user_attribute_uuid`,
                `${UserAttributesTable}.user_attribute_uuid`,
            )
            .select<
                Array<
                    Pick<DbUserAttribute, 'name'> &
                        Pick<DbGroupUserAttribute, 'values'>
                >
            >(
                `${UserAttributesTable}.name`,
                `${GroupUserAttributesTable}.values`,
            )
            .whereIn(
                `${GroupUserAttributesTable}.user_attribute_uuid`,
                attributeValues.map((attr) => attr.user_attribute_uuid),
            )
            .where(
                `${OrganizationTableName}.organization_uuid`,
                filters.organizationUuid,
            )
            .where(`${UserTableName}.user_uuid`, filters.userUuid);

        const groupValuesMap = groupsValues.reduce<Record<string, string[]>>(
            (acc, row) => ({
                ...acc,
                [row.name]: acc[row.name]
                    ? [...acc[row.name], ...row.values]
                    : [...row.values],
            }),
            {},
        );

        // combine group, user and default values
        return attributeValues.reduce<UserAttributeValueMap>((acc, row) => {
            const memberValues: string[] = userValuesMap[row.name] ?? [];
            const groupValues: string[] = groupValuesMap[row.name] ?? [];
            let finalValues: string[];
            if (memberValues.length > 0 || groupValues.length > 0) {
                finalValues = [...new Set([...memberValues, ...groupValues])];
            } else if (row.attribute_defaults) {
                finalValues = row.attribute_defaults;
            } else {
                finalValues = [];
            }
            return {
                ...acc,
                [row.name]: finalValues,
            };
        }, {});
    }

    async find(filters: {
        organizationUuid?: string;
        userAttributeUuid?: string;
    }): Promise<UserAttribute[]> {
        const query = this.database(UserAttributesTable)
            .leftJoin(
                OrganizationMemberUserAttributesTable,
                `${OrganizationMemberUserAttributesTable}.user_attribute_uuid`,
                `${UserAttributesTable}.user_attribute_uuid`,
            )
            .leftJoin(
                GroupUserAttributesTable,
                `${GroupUserAttributesTable}.user_attribute_uuid`,
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
                    } & {
                        group_uuid: string;
                        group_values: string[];
                    })[]
            >(
                `${UserAttributesTable}.*`,
                `${OrganizationMemberUserAttributesTable}.user_id`,
                `${OrganizationMemberUserAttributesTable}.values`,
                `emails.email`,
                `users.user_uuid`,
                `organizations.organization_uuid`,
                `${GroupUserAttributesTable}.group_uuid`,
                `${GroupUserAttributesTable}.values as group_values`,
            )
            .orderBy('created_at', 'desc');

        if (filters.organizationUuid) {
            void query.where(
                `organizations.organization_uuid`,
                filters.organizationUuid,
            );
        }
        if (filters.userAttributeUuid) {
            void query.where(
                `${UserAttributesTable}.user_attribute_uuid`,
                filters.userAttributeUuid,
            );
        }

        const orgAttributes = await query;

        const results = orgAttributes.reduce<Record<string, UserAttribute>>(
            (acc, orgAttribute) => {
                if (acc[orgAttribute.user_attribute_uuid]) {
                    // If the user attribute already exists, add the user or group to the list
                    // unless that user or group is already there
                    if (
                        orgAttribute.user_id &&
                        !acc[orgAttribute.user_attribute_uuid].users.find(
                            (u) => u.userUuid === orgAttribute.user_uuid,
                        )
                    ) {
                        acc[orgAttribute.user_attribute_uuid].users.push({
                            userUuid: orgAttribute.user_uuid,
                            values: orgAttribute.values,
                            value: orgAttribute.values?.[0] ?? '',
                            email: orgAttribute.email,
                        });
                    }
                    if (
                        orgAttribute.group_uuid &&
                        !acc[orgAttribute.user_attribute_uuid].groups.find(
                            (g) => g.groupUuid === orgAttribute.group_uuid,
                        )
                    ) {
                        acc[orgAttribute.user_attribute_uuid].groups.push({
                            groupUuid: orgAttribute.group_uuid,
                            values: orgAttribute.group_values,
                            value: orgAttribute.group_values?.[0] ?? '',
                        });
                    }
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
                        attributeDefaults: orgAttribute.attribute_defaults,
                        attributeDefault:
                            orgAttribute.attribute_defaults?.[0] ?? null,
                        users: orgAttribute.user_id
                            ? [
                                  {
                                      userUuid: orgAttribute.user_uuid,
                                      values: orgAttribute.values,
                                      value: orgAttribute.values?.[0] ?? '',
                                      email: orgAttribute.email,
                                  },
                              ]
                            : [],
                        groups: orgAttribute.group_uuid
                            ? [
                                  {
                                      groupUuid: orgAttribute.group_uuid,
                                      values: orgAttribute.group_values,
                                      value:
                                          orgAttribute.group_values?.[0] ?? '',
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
        users: { userUuid: string; values: string[] }[],
    ): Promise<void> {
        const promises = users.map(async (userAttr) => {
            const [user] = await trx(`users`)
                .where(`users.user_uuid`, userAttr.userUuid)
                .select('user_id');
            return trx(OrganizationMemberUserAttributesTable).insert({
                user_id: user.user_id,
                organization_id: organizationId,
                user_attribute_uuid: userAttributeUuid,
                values: userAttr.values,
            });
        });

        await Promise.all(promises);
    }

    private static async insertGroupAttributes(
        trx: Knex.Transaction,
        userAttributeUuid: string,
        groups: { groupUuid: string; values: string[] }[],
    ): Promise<void> {
        const promises = groups.map(async (groupAttr) =>
            trx(GroupUserAttributesTable).insert({
                group_uuid: groupAttr.groupUuid,
                user_attribute_uuid: userAttributeUuid,
                values: groupAttr.values,
            }),
        );

        await Promise.all(promises);
    }

    async create(
        organizationUuid: string,
        orgAttribute: CreateUserAttribute,
    ): Promise<UserAttribute> {
        const [organization] = await this.database(OrganizationTableName)
            .select('organization_id')
            .where('organization_uuid', organizationUuid);

        const users = orgAttribute.users.map((u) => ({
            userUuid: u.userUuid,
            values: getUserAttributeValues(u),
        }));
        const groups = orgAttribute.groups.map((g) => ({
            groupUuid: g.groupUuid,
            values: getUserAttributeValues(g),
        }));

        const attributeUuid = await this.database.transaction(async (trx) => {
            const [inserted] = await trx(UserAttributesTable)
                .insert({
                    name: orgAttribute.name,
                    description: orgAttribute.description,
                    organization_id: organization.organization_id,
                    attribute_defaults: getAttributeDefaultValues(orgAttribute),
                })
                .returning('*');

            await UserAttributesModel.insertOrganizationMemberUserAttributes(
                trx,
                inserted.user_attribute_uuid,
                organization.organization_id,
                users,
            );

            await UserAttributesModel.insertGroupAttributes(
                trx,
                inserted.user_attribute_uuid,
                groups,
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

        const users = orgAttribute.users.map((u) => ({
            userUuid: u.userUuid,
            values: getUserAttributeValues(u),
        }));
        const groups = orgAttribute.groups.map((g) => ({
            groupUuid: g.groupUuid,
            values: getUserAttributeValues(g),
        }));

        // Delete all users and groups
        // Update the attribute
        // Add all users and groups back in
        await this.database.transaction(async (trx) => {
            await trx
                .delete()
                .from(OrganizationMemberUserAttributesTable)
                .where('user_attribute_uuid', orgAttributeUuid)
                .andWhere('organization_id', organization.organization_id);

            await trx
                .delete()
                .from(GroupUserAttributesTable)
                .where('user_attribute_uuid', orgAttributeUuid);

            await trx(UserAttributesTable)
                .update({
                    name: orgAttribute.name,
                    description: orgAttribute.description,
                    attribute_defaults: getAttributeDefaultValues(orgAttribute),
                })
                .where('user_attribute_uuid', orgAttributeUuid);

            await UserAttributesModel.insertOrganizationMemberUserAttributes(
                trx,
                orgAttributeUuid,
                organization.organization_id,
                users,
            );

            await UserAttributesModel.insertGroupAttributes(
                trx,
                orgAttributeUuid,
                groups,
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
