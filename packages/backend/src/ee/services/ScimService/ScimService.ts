import { subject } from '@casl/ability';
import {
    AlreadyExistsError,
    CommercialFeatureFlags,
    ForbiddenError,
    getErrorMessage,
    GroupWithMembers,
    isOrganizationMemberRole,
    isValidEmailAddress,
    LightdashUser,
    NotFoundError,
    OrganizationMemberProfile,
    OrganizationMemberRole,
    ParameterError,
    ScimError,
    ScimGroup,
    ScimListResponse,
    ScimResourceType,
    ScimSchema,
    ScimSchemaAttribute,
    ScimSchemaType,
    ScimServiceProviderConfig,
    ScimUpsertGroup,
    ScimUpsertUser,
    ScimUser,
    SessionUser,
} from '@lightdash/common';
import * as Sentry from '@sentry/node';
import { groupBy } from 'lodash';
import {
    InvalidScimPatchRequest,
    ScimResource as PatchLibScimResource,
    ScimPatch,
    scimPatch,
} from 'scim-patch';
import { parse } from 'scim2-parse-filter';
import { LightdashAnalytics } from '../../../analytics/LightdashAnalytics';
import { LightdashConfig } from '../../../config/parseConfig';
import { EmailModel } from '../../../models/EmailModel';
import { GroupsModel } from '../../../models/GroupsModel';
import { OrganizationMemberProfileModel } from '../../../models/OrganizationMemberProfileModel';
import { RolesModel } from '../../../models/RolesModel';
import { UserModel } from '../../../models/UserModel';
import { BaseService } from '../../../services/BaseService';
import {
    ScimAccessTokenAuthenticationEvent,
    ScimAccessTokenEvent,
} from '../../analytics';
import { CommercialFeatureFlagModel } from '../../models/CommercialFeatureFlagModel';
import { ServiceAccountModel } from '../../models/ServiceAccountModel';

type ScimServiceArguments = {
    lightdashConfig: LightdashConfig;
    organizationMemberProfileModel: OrganizationMemberProfileModel;
    userModel: UserModel;
    emailModel: EmailModel;
    analytics: LightdashAnalytics;
    groupsModel: GroupsModel;
    serviceAccountModel: ServiceAccountModel;
    commercialFeatureFlagModel: CommercialFeatureFlagModel;
    rolesModel: RolesModel;
};

export class ScimService extends BaseService {
    private readonly lightdashConfig: LightdashConfig;

    private readonly organizationMemberProfileModel: OrganizationMemberProfileModel;

    private readonly userModel: UserModel;

    private readonly emailModel: EmailModel;

    private readonly analytics: LightdashAnalytics;

    private readonly groupsModel: GroupsModel;

    private readonly serviceAccountModel: ServiceAccountModel;

    private readonly commercialFeatureFlagModel: CommercialFeatureFlagModel;

    private readonly rolesModel: RolesModel;

    constructor({
        lightdashConfig,
        organizationMemberProfileModel,
        userModel,
        emailModel,
        analytics,
        groupsModel,
        serviceAccountModel,
        commercialFeatureFlagModel,
        rolesModel,
    }: ScimServiceArguments) {
        super();
        this.lightdashConfig = lightdashConfig;
        this.organizationMemberProfileModel = organizationMemberProfileModel;
        this.userModel = userModel;
        this.emailModel = emailModel;
        this.analytics = analytics;
        this.groupsModel = groupsModel;
        this.serviceAccountModel = serviceAccountModel;
        this.commercialFeatureFlagModel = commercialFeatureFlagModel;
        this.rolesModel = rolesModel;
    }

    private static throwForbiddenErrorOnNoPermission(user: SessionUser) {
        if (
            user.ability.cannot(
                'manage',
                subject('Organization', {
                    organizationUuid: user.organizationUuid,
                }),
            )
        ) {
            throw new ForbiddenError('You do not have permission');
        }
    }

    private convertLightdashGroupToScimGroup(
        group: GroupWithMembers,
    ): ScimGroup {
        return {
            schemas: [ScimSchemaType.GROUP],
            id: group.uuid,
            displayName: group.name,
            members: group.members.map((member) => ({
                value: member.userUuid,
                display: member.email,
            })),
            meta: {
                resourceType: 'Group',
                created: group.createdAt,
                lastModified: group.updatedAt,
                location: new URL(
                    `/api/v1/scim/v2/Groups/${group.uuid}`,
                    this.lightdashConfig.siteUrl,
                ).href,
            },
        };
    }

    private convertLightdashUserToScimUser(
        user: LightdashUser | OrganizationMemberProfile,
    ): ScimUser {
        const createdAt =
            'createdAt' in user ? user.createdAt : user.userCreatedAt;
        const updatedAt =
            'updatedAt' in user ? user.updatedAt : user.userUpdatedAt;

        // Create the base SCIM user
        const scimUser: ScimUser = {
            schemas: [ScimSchemaType.USER],
            id: user.userUuid,
            userName: user.email || '',
            name: {
                givenName: user.firstName,
                familyName: user.lastName,
            },
            active: user.isActive,
            emails: [
                {
                    value: user.email || '',
                    primary: true,
                },
            ],
            meta: {
                resourceType: 'User',
                created: createdAt,
                lastModified: updatedAt,
                location: new URL(
                    `/api/v1/scim/v2/Users/${user.userUuid}`,
                    this.lightdashConfig.siteUrl,
                ).href,
            },
        };

        // Add the Lightdash extension schema if the user has a role
        if (user.role) {
            scimUser.schemas.push(ScimSchemaType.LIGHTDASH_USER_EXTENSION);
            scimUser[ScimSchemaType.LIGHTDASH_USER_EXTENSION] = {
                role: user.role,
            };
        }

        return scimUser;
    }

    static getScimUserEmail(user: Pick<ScimUser, 'userName'>): string {
        // check if username is an email and make sure it's valid
        const username = user.userName;
        if (username && isValidEmailAddress(username)) {
            return username;
        }
        throw new ParameterError('Username must be a valid email');
    }

    static convertScimToKnexPagination(
        startIndex: number,
        count: number,
    ): { page: number; pageSize: number } {
        // Treat startIndex as 1 if less than 1
        const scimIndex = startIndex < 1 ? 1 : startIndex;

        // Ensure startIndex follows the valid pattern based on the count value.
        // eg: if count is 10 then startIndex needs to be 1, 11, 21, 31, etc.
        if ((scimIndex - 1) % count !== 0) {
            throw new ScimError({
                detail: `Invalid startIndex: ${scimIndex} must follow the pattern 1,${[
                    1, 2, 3,
                ].map((multiple) => count * multiple + 1)}, ...`,
                status: 400,
            });
        }

        // Calculate the page number: page 1 corresponds to startIndex = 1
        const page = Math.floor((scimIndex - 1) / count) + 1;

        return { page, pageSize: count };
    }

    private static getErrorStatus(error: unknown) {
        if (
            error instanceof Error &&
            `status` in error &&
            error.status &&
            typeof error.status === 'number'
        )
            return error.status;
        return undefined;
    }

    // Retrieve a single SCIM user by ID
    async getUser({
        userUuid,
        organizationUuid,
    }: {
        userUuid: string;
        organizationUuid: string;
    }): Promise<ScimUser> {
        this.logger.debug('SCIM: Getting user', { userUuid, organizationUuid });
        try {
            const user =
                await this.organizationMemberProfileModel.getOrganizationMemberByUuid(
                    organizationUuid,
                    userUuid,
                );
            this.logger.debug('SCIM: Successfully retrieved user', {
                userUuid,
                organizationUuid,
                userEmail: user.email,
                isActive: user.isActive,
                role: user.role,
            });
            // Construct SCIM-compliant response
            return this.convertLightdashUserToScimUser(user);
        } catch (error) {
            if (error instanceof NotFoundError) {
                throw new ScimError({
                    detail: `User with UUID ${userUuid} not found`,
                    status: 404,
                    scimType: 'noTarget',
                });
            }
            this.logger.error(
                `Failed to retrieve SCIM user: ${getErrorMessage(error)}`,
            );
            const scimError = new ScimError({
                detail: getErrorMessage(error),
                status: ScimService.getErrorStatus(error) ?? 404,
            });
            Sentry.captureException(scimError);
            throw scimError;
        }
    }

    // List all SCIM users in an organization
    async listUsers({
        organizationUuid,
        startIndex = 1,
        itemsPerPage = 100,
        filter,
    }: {
        organizationUuid: string;
        startIndex?: number;
        itemsPerPage?: number;
        filter?: string;
    }): Promise<ScimListResponse<ScimUser>> {
        this.logger.debug('SCIM: Listing users', {
            organizationUuid,
            startIndex,
            itemsPerPage,
            filter,
        });
        try {
            const parsedFilter = filter ? parse(filter) : null;
            this.logger.debug('SCIM: Parsed filter', { parsedFilter });

            // these columns map from the potential scim filter to the actual user columns
            const userColumnMapping = {
                userName: 'email',
                'name.givenName': 'first_name',
                'name.familyName': 'last_name',
                'emails.value': 'email',
            } as Record<string, string>;

            const exactMatchFilter =
                parsedFilter?.op === 'eq' &&
                parsedFilter?.attrPath in userColumnMapping
                    ? {
                          column: userColumnMapping[parsedFilter.attrPath],
                          value: `${parsedFilter.compValue}`, // converts to string
                      }
                    : undefined;

            const paginateArgs = ScimService.convertScimToKnexPagination(
                startIndex,
                itemsPerPage,
            );

            const { pagination, data: members } =
                await this.organizationMemberProfileModel.getOrganizationMembers(
                    {
                        organizationUuid,
                        exactMatchFilter,
                        paginateArgs,
                        sort: {
                            column: 'users.updated_at',
                            direction: 'asc',
                        },
                    },
                );

            // Map members to SCIM format
            const scimUsers = members.map((member) =>
                this.convertLightdashUserToScimUser(member),
            );

            this.logger.debug('SCIM: Successfully listed users', {
                organizationUuid,
                totalResults: pagination?.totalResults ?? 0,
                returnedCount: scimUsers.length,
                startIndex,
                itemsPerPage: pagination?.pageSize ?? 0,
            });

            return {
                schemas: [ScimSchemaType.LIST_RESPONSE],
                totalResults: pagination?.totalResults ?? 0,
                itemsPerPage: pagination?.pageSize ?? 0,
                startIndex,
                Resources: scimUsers,
            };
        } catch (error) {
            this.logger.error(
                `Failed to list SCIM users: ${getErrorMessage(error)}`,
            );
            throw new ScimError({
                detail: 'Failed to list SCIM users',
                status: ScimService.getErrorStatus(error) ?? 400,
            });
        }
    }

    // Create a SCIM user
    async createUser({
        user,
        organizationUuid,
    }: {
        user: ScimUpsertUser;
        organizationUuid: string;
    }): Promise<ScimUser> {
        this.logger.debug('SCIM: Creating user', {
            organizationUuid,
            userName: user.userName,
            firstName: user.name?.givenName,
            lastName: user.name?.familyName,
            active: user.active,
            hasExtensionData: !!user[ScimSchemaType.LIGHTDASH_USER_EXTENSION],
            extensionRole: user[ScimSchemaType.LIGHTDASH_USER_EXTENSION]?.role,
        });
        try {
            const email = ScimService.getScimUserEmail(user);
            const dbUser = await this.userModel.createUser(
                {
                    email,
                    firstName: user.name?.givenName || '',
                    lastName: user.name?.familyName || '',
                    password: user.password || '',
                },
                user.active,
            );
            // Extract role from extension schema if available
            const extensionData = user[ScimSchemaType.LIGHTDASH_USER_EXTENSION];
            let role = OrganizationMemberRole.MEMBER; // Default role

            // If a role is provided in the extension schema, validate and use it
            if (extensionData?.role) {
                // Validate that the role is a valid OrganizationMemberRole
                if (!isOrganizationMemberRole(extensionData.role)) {
                    throw new ParameterError(
                        `Invalid role: ${
                            extensionData.role
                        }. Role must be one of: ${Object.values(
                            OrganizationMemberRole,
                        ).join(', ')}`,
                    );
                }
                role = extensionData.role;
            }

            // Add user to organization
            await this.organizationMemberProfileModel.createOrganizationMembershipByUuid(
                {
                    organizationUuid,
                    userUuid: dbUser.userUuid,
                    role,
                },
            );
            // verify user email on create if coming from scim
            await this.emailModel.verifyUserEmailIfExists(
                dbUser.userUuid,
                email,
            );
            this.logger.debug('SCIM: Successfully created user', {
                organizationUuid,
                userUuid: dbUser.userUuid,
                email,
                role,
                isActive: user.active,
            });
            this.analytics.track({
                event: 'user.created',
                anonymousId: LightdashAnalytics.anonymousId,
                properties: {
                    context: 'scim',
                    organizationId: organizationUuid,
                    createdUserId: dbUser.userUuid,
                    userConnectionType: 'password',
                },
            });
            // Construct SCIM-compliant response
            return this.convertLightdashUserToScimUser(dbUser);
        } catch (error) {
            if (error instanceof ParameterError) {
                throw new ScimError({
                    detail: error.message,
                    status: 400,
                    scimType: 'invalidValue',
                });
            }
            if (error instanceof AlreadyExistsError) {
                throw new ScimError({
                    detail: error.message,
                    status: 409,
                    scimType: 'uniqueness',
                });
            }
            this.logger.error(
                `Failed to create SCIM user: ${getErrorMessage(error)}`,
            );
            const scimError = new ScimError({
                detail: 'Failed to create SCIM user',
                status: ScimService.getErrorStatus(error) ?? 500,
            });
            Sentry.captureException(scimError);
            throw scimError;
        }
    }

    // Update an existing SCIM user
    async updateUser({
        user,
        userUuid,
        organizationUuid,
    }: {
        user: ScimUpsertUser;
        userUuid: string;
        organizationUuid: string;
    }): Promise<ScimUser> {
        this.logger.debug('SCIM: Updating user', {
            userUuid,
            organizationUuid,
            userName: user.userName,
            firstName: user.name?.givenName,
            lastName: user.name?.familyName,
            active: user.active,
            hasExtensionData: !!user[ScimSchemaType.LIGHTDASH_USER_EXTENSION],
            extensionRole: user[ScimSchemaType.LIGHTDASH_USER_EXTENSION]?.role,
        });
        try {
            const emailToUpdate = ScimService.getScimUserEmail(user);
            // get existing user (and make sure user is in the organization)
            const dbUser =
                await this.organizationMemberProfileModel.getOrganizationMemberByUuid(
                    organizationUuid,
                    userUuid,
                );
            // update user
            const updatedUser = await this.userModel.updateUser(
                dbUser.userUuid,
                dbUser.email,
                {
                    // conditionally update fields
                    firstName: user.name?.givenName || dbUser.firstName,
                    lastName: user.name?.familyName || dbUser.lastName,
                    email: emailToUpdate,
                    isActive: user.active ?? dbUser.isActive,
                },
            );

            // Update user's organization role if provided in the extension schema
            const extensionData = user[ScimSchemaType.LIGHTDASH_USER_EXTENSION];
            if (extensionData?.role && extensionData.role !== dbUser.role) {
                // Validate that the role is a valid OrganizationMemberRole
                if (!isOrganizationMemberRole(extensionData.role)) {
                    throw new ParameterError(
                        `Invalid role: ${
                            extensionData.role
                        }. Role must be one of: ${Object.values(
                            OrganizationMemberRole,
                        ).join(', ')}`,
                    );
                }

                await this.organizationMemberProfileModel.updateOrganizationMember(
                    organizationUuid,
                    userUuid,
                    {
                        role: extensionData.role,
                    },
                );
            }

            // If setting user to inactive, drop org role to MEMBER and remove project roles
            if (user.active === false) {
                try {
                    if (dbUser.role !== OrganizationMemberRole.MEMBER) {
                        await this.organizationMemberProfileModel.updateOrganizationMember(
                            organizationUuid,
                            userUuid,
                            {
                                role: OrganizationMemberRole.MEMBER,
                            },
                        );
                        this.logger.debug(
                            'SCIM: Updated user organisation role to MEMBER',
                            {
                                userUuid,
                                organizationUuid,
                                role: OrganizationMemberRole.MEMBER,
                            },
                        );
                    }
                } catch (e) {
                    this.logger.error(
                        `Failed to drop organization role for inactive user ${userUuid} to MEMBER: ${getErrorMessage(
                            e,
                        )}`,
                    );
                }
                try {
                    const projectsCount =
                        await this.rolesModel.removeUserAccessFromAllProjects(
                            dbUser.userUuid,
                        );
                    this.logger.debug(
                        'SCIM: Removed user roles from all projects',
                        {
                            userUuid,
                            organizationUuid,
                            projectsCount,
                        },
                    );
                } catch (e) {
                    this.logger.error(
                        `Failed to remove project roles for inactive user ${userUuid}: ${getErrorMessage(
                            e,
                        )}`,
                    );
                }

                // Remove user from all groups in the organization when deactivated
                try {
                    const groupsCount =
                        await this.groupsModel.removeUserFromAllGroups({
                            organizationUuid,
                            userUuid,
                        });
                    this.logger.debug('SCIM: Removed user from all groups', {
                        userUuid,
                        organizationUuid,
                        groupsCount,
                    });
                } catch (e) {
                    this.logger.error(
                        `Failed to remove group memberships for inactive user ${userUuid}: ${getErrorMessage(
                            e,
                        )}`,
                    );
                }
            }

            // Get the updated user with potentially new role
            const finalUser = await this.userModel.getUserDetailsByUuid(
                updatedUser.userUuid,
            );

            this.logger.debug('SCIM: Successfully updated user', {
                userUuid,
                organizationUuid,
                emailToUpdate,
                roleChanged: extensionData?.role !== dbUser.role,
                newRole: extensionData?.role,
                previousRole: dbUser.role,
                isActive: finalUser.isActive,
            });

            this.analytics.track({
                event: 'user.updated',
                anonymousId: LightdashAnalytics.anonymousId,
                properties: {
                    ...finalUser,
                    updatedUserId: finalUser.userUuid,
                    organizationId: finalUser.organizationUuid,
                    context: 'scim',
                },
            });
            // Construct SCIM-compliant response
            return this.convertLightdashUserToScimUser(finalUser);
        } catch (error) {
            if (error instanceof ParameterError) {
                throw new ScimError({
                    detail: error.message,
                    status: 400,
                    scimType: 'invalidValue',
                });
            }
            if (error instanceof NotFoundError) {
                throw new ScimError({
                    detail: `User with UUID ${userUuid} not found`,
                    status: 404,
                    scimType: 'noTarget',
                });
            }
            this.logger.error(
                `Failed to update SCIM user: ${getErrorMessage(error)}`,
            );
            Sentry.captureException(error);
            throw new ScimError({
                detail: 'Failed to update SCIM user',
                status: ScimService.getErrorStatus(error) ?? 500,
            });
        }
    }

    async patchUser({
        userUuid,
        organizationUuid,
        patchOp,
    }: {
        userUuid: string;
        organizationUuid: string;
        patchOp: ScimPatch;
    }): Promise<ScimUser> {
        this.logger.debug('SCIM: Patching user', {
            userUuid,
            organizationUuid,
            operationsCount: patchOp.Operations.length,
            operations: patchOp.Operations.map((op) => ({
                op: op.op,
                path: op.path,
                hasValue: !!op.value,
            })),
        });
        try {
            // get existing user (and make sure user is in the organization)
            const dbUser =
                await this.organizationMemberProfileModel.getOrganizationMemberByUuid(
                    organizationUuid,
                    userUuid,
                );
            // construct SCIM user object
            const scimDbUser = this.convertLightdashUserToScimUser(dbUser);
            // use lib to construct patched user object
            const patchedDbUserObj = scimPatch(
                scimDbUser as PatchLibScimResource,
                patchOp.Operations,
            );
            this.logger.debug('SCIM: Applied patch operations to user', {
                userUuid,
                organizationUuid,
                patchedFields: Object.keys(patchedDbUserObj),
            });
            // apply updates to user
            const patchedUser = await this.updateUser({
                user: patchedDbUserObj as ScimUpsertUser,
                userUuid,
                organizationUuid,
            });
            return patchedUser;
        } catch (error) {
            if (error instanceof Error) {
                switch (error.constructor) {
                    case ParameterError:
                    case InvalidScimPatchRequest:
                        throw new ScimError({
                            detail: error.message,
                            status: 400,
                            scimType: 'invalidValue',
                        });
                    case NotFoundError:
                        throw new ScimError({
                            detail: `User with UUID ${userUuid} not found`,
                            status: 404,
                            scimType: 'noTarget',
                        });
                    case ScimError:
                        throw error; // pass through scim errors (from this.updateUser)
                    default:
                        this.logger.error(
                            `Failed to patch SCIM user: ${getErrorMessage(
                                error,
                            )}`,
                        );
                        const scimError = new ScimError({
                            detail: 'Failed to patch SCIM user',
                            status: ScimService.getErrorStatus(error) ?? 500,
                        });
                        Sentry.captureException(scimError);
                        throw scimError;
                }
            }
            throw new ScimError({
                detail: 'Failed to patch SCIM user: unknown error',
                status: ScimService.getErrorStatus(error) ?? 500,
            });
        }
    }

    // Delete a SCIM user by ID
    async deleteUser({
        userUuid,
        organizationUuid,
    }: {
        userUuid: string;
        organizationUuid: string;
    }): Promise<void> {
        this.logger.debug('SCIM: Deleting user', {
            userUuid,
            organizationUuid,
        });
        try {
            // get existing user (and make sure user is in the organization)
            const dbUser =
                await this.organizationMemberProfileModel.getOrganizationMemberByUuid(
                    organizationUuid,
                    userUuid,
                );

            // Check if user is the last admin in the organization
            const [admin, ...remainingAdmins] =
                await this.organizationMemberProfileModel.getOrganizationAdmins(
                    organizationUuid,
                );
            if (remainingAdmins.length === 0 && admin.userUuid === userUuid) {
                this.logger.debug(
                    'SCIM: Cannot delete user - last admin in organization',
                    {
                        userUuid,
                        organizationUuid,
                        email: dbUser.email,
                    },
                );
                throw new ParameterError(
                    'Organization must have at least one admin',
                );
            }

            await this.userModel.delete(dbUser.userUuid);

            this.logger.debug('SCIM: Successfully deleted user', {
                userUuid,
                organizationUuid,
                email: dbUser.email,
                role: dbUser.role,
            });

            this.analytics.track({
                event: 'user.deleted',
                anonymousId: LightdashAnalytics.anonymousId,
                properties: {
                    context: 'scim',
                    firstName: dbUser.firstName,
                    lastName: dbUser.lastName,
                    email: dbUser.email,
                    organizationId: dbUser.organizationUuid,
                    deletedUserId: dbUser.userUuid,
                },
            });
            return undefined;
        } catch (error) {
            if (error instanceof ParameterError) {
                throw new ScimError({
                    detail: error.message,
                    status: 400,
                    scimType: 'invalidValue',
                });
            }
            if (error instanceof NotFoundError) {
                throw new ScimError({
                    detail: `User with UUID ${userUuid} not found`,
                    status: 404,
                    scimType: 'noTarget',
                });
            }
            this.logger.error(
                `Failed to delete SCIM user: ${getErrorMessage(error)}`,
            );
            const scimError = new ScimError({
                detail: 'Failed to delete SCIM user',
                status: ScimService.getErrorStatus(error) ?? 500,
            });
            Sentry.captureException(scimError);
            throw scimError;
        }
    }

    async getGroup(
        organizationUuid: string,
        groupUuid: string,
    ): Promise<ScimGroup> {
        this.logger.debug('SCIM: Getting group', {
            groupUuid,
            organizationUuid,
        });
        try {
            const group = await this.groupsModel.getGroupWithMembers(groupUuid);
            if (group.organizationUuid !== organizationUuid) {
                this.logger.debug('SCIM: Group not found in organization', {
                    groupUuid,
                    organizationUuid,
                    groupOrgUuid: group.organizationUuid,
                });
                throw new ScimError({
                    detail: `Group with UUID ${groupUuid} not found`,
                    status: 404,
                    scimType: 'noTarget',
                });
            }
            this.logger.debug('SCIM: Successfully retrieved group', {
                groupUuid,
                organizationUuid,
                groupName: group.name,
                memberCount: group.members.length,
            });
            return this.convertLightdashGroupToScimGroup(group);
        } catch (error) {
            if (error instanceof ScimError) {
                throw error;
            }
            if (error instanceof NotFoundError) {
                throw new ScimError({
                    detail: `Group with UUID ${groupUuid} not found`,
                    status: 404,
                    scimType: 'noTarget',
                });
            }
            this.logger.error(
                `Failed to retrieve SCIM group: ${getErrorMessage(error)}`,
            );
            const scimError = new ScimError({
                detail: getErrorMessage(error),
                status: ScimService.getErrorStatus(error) ?? 500,
            });
            Sentry.captureException(scimError);
            throw scimError;
        }
    }

    async listGroups({
        organizationUuid,
        startIndex = 1,
        itemsPerPage = 100,
        filter,
    }: {
        organizationUuid: string;
        startIndex?: number;
        itemsPerPage?: number;
        filter?: string;
    }): Promise<ScimListResponse<ScimGroup>> {
        this.logger.debug('SCIM: Listing groups', {
            organizationUuid,
            startIndex,
            itemsPerPage,
            filter,
        });
        try {
            const parsedFilter = filter ? parse(filter) : null;
            this.logger.debug('SCIM: Parsed group filter', { parsedFilter });

            const exactMatchFilterName =
                parsedFilter?.op === 'eq' &&
                parsedFilter?.attrPath === 'displayName'
                    ? `${parsedFilter.compValue}`
                    : undefined;

            const paginateArgs = ScimService.convertScimToKnexPagination(
                startIndex,
                itemsPerPage,
            );

            // Get filtered groups from the database
            const { pagination, data: groups } = await this.groupsModel.find(
                {
                    organizationUuid,
                    name: exactMatchFilterName,
                },
                paginateArgs,
            );

            // fetch members for each group
            const { data: groupMembers } =
                await this.groupsModel.findGroupMembers({
                    organizationUuid,
                    groupUuids: groups.map((group) => group.uuid),
                });
            const groupMembersMap = groupBy(groupMembers, 'groupUuid');

            // Map groups to SCIM format
            const scimGroups = groups.map((group) =>
                this.convertLightdashGroupToScimGroup({
                    ...group,
                    members: groupMembersMap[group.uuid] || [],
                    memberUuids: (groupMembersMap[group.uuid] || []).map(
                        (member) => member.userUuid,
                    ),
                }),
            );

            this.logger.debug('SCIM: Successfully listed groups', {
                organizationUuid,
                totalResults: pagination?.totalResults ?? 0,
                returnedCount: scimGroups.length,
                startIndex,
                itemsPerPage: pagination?.pageSize ?? 0,
            });

            return {
                schemas: [ScimSchemaType.LIST_RESPONSE],
                totalResults: pagination?.totalResults ?? 0,
                itemsPerPage: pagination?.pageSize ?? 0,
                startIndex,
                Resources: scimGroups,
            };
        } catch (error) {
            this.logger.error(
                `Failed to retrieve SCIM groups: ${getErrorMessage(error)}`,
            );
            const scimError = new ScimError({
                detail: getErrorMessage(error),
                status: ScimService.getErrorStatus(error) ?? 500,
            });
            Sentry.captureException(scimError);
            throw scimError;
        }
    }

    async createGroup(
        organizationUuid: string,
        groupToCreate: ScimUpsertGroup,
    ): Promise<ScimGroup> {
        this.logger.debug('SCIM: Creating group', {
            organizationUuid,
            displayName: groupToCreate.displayName,
            memberCount: groupToCreate.members?.length || 0,
            memberUuids: groupToCreate.members?.map((m) => m.value) || [],
        });
        try {
            if (!groupToCreate.displayName) {
                throw new ScimError({
                    detail: 'displayName is required',
                    status: 400,
                    scimType: 'invalidValue',
                });
            }
            const { data: matchesByName } = await this.groupsModel.find({
                organizationUuid,
                name: groupToCreate.displayName,
            });

            if (matchesByName.length > 0) {
                this.logger.debug('SCIM: Group name already exists', {
                    organizationUuid,
                    displayName: groupToCreate.displayName,
                    existingGroups: matchesByName.map((g) => ({
                        uuid: g.uuid,
                        name: g.name,
                    })),
                });
                throw new ScimError({
                    detail: 'Group with this name already exists',
                    status: 409,
                    scimType: 'uniqueness',
                });
            }

            const group = await this.groupsModel.createGroup({
                createdByUserUuid: null,
                createGroup: {
                    organizationUuid,
                    name: groupToCreate.displayName,
                    ...(groupToCreate.members !== undefined
                        ? {
                              members: groupToCreate.members.map((member) => ({
                                  userUuid: member.value,
                              })),
                          }
                        : {}),
                },
            });

            this.logger.debug('SCIM: Successfully created group', {
                organizationUuid,
                groupUuid: group.uuid,
                groupName: group.name,
                memberCount: group.memberUuids.length,
            });

            this.analytics.track({
                event: 'group.created',
                anonymousId: LightdashAnalytics.anonymousId,
                properties: {
                    organizationId: group.organizationUuid,
                    groupId: group.uuid,
                    name: group.name,
                    countUsersInGroup: group.memberUuids.length,
                    viaSso: false,
                    context: 'scim',
                },
            });
            return this.convertLightdashGroupToScimGroup(group);
        } catch (error) {
            if (error instanceof ScimError) {
                throw error;
            }
            this.logger.error(
                `Failed to replace SCIM group: ${getErrorMessage(error)}`,
            );
            const scimError = new ScimError({
                detail: getErrorMessage(error),
                status: ScimService.getErrorStatus(error) ?? 500,
            });
            Sentry.captureException(scimError);
            throw scimError;
        }
    }

    async replaceGroup(
        organizationUuid: string,
        groupUuid: string,
        groupToUpdate: ScimUpsertGroup,
    ): Promise<ScimGroup> {
        this.logger.debug('SCIM: Replacing group', {
            organizationUuid,
            groupUuid,
            displayName: groupToUpdate.displayName,
            memberCount: groupToUpdate.members?.length || 0,
            memberUuids: groupToUpdate.members?.map((m) => m.value) || [],
        });
        try {
            if (!groupToUpdate.displayName) {
                throw new ScimError({
                    detail: 'displayName is required',
                    status: 400,
                    scimType: 'invalidValue',
                });
            }

            const group = await this.groupsModel.getGroupWithMembers(groupUuid);
            if (group.organizationUuid !== organizationUuid) {
                this.logger.debug(
                    'SCIM: Group not found in organization for replace',
                    {
                        groupUuid,
                        organizationUuid,
                        groupOrgUuid: group.organizationUuid,
                    },
                );
                throw new ScimError({
                    detail: `Group with UUID ${groupUuid} not found`,
                    status: 404,
                    scimType: 'noTarget',
                });
            }

            const { data: matchesByName } = await this.groupsModel.find({
                organizationUuid,
                name: groupToUpdate.displayName,
            });

            // Check for name uniqueness, but exclude the current group from the check
            const conflictingGroups = matchesByName.filter(
                (match) => match.uuid !== groupUuid,
            );
            if (conflictingGroups.length > 0) {
                this.logger.debug('SCIM: Group name conflict on replace', {
                    organizationUuid,
                    groupUuid,
                    displayName: groupToUpdate.displayName,
                    conflictingGroups: conflictingGroups.map((g) => ({
                        uuid: g.uuid,
                        name: g.name,
                    })),
                });
                throw new ScimError({
                    detail: 'Group with this name already exists',
                    status: 409,
                    scimType: 'uniqueness',
                });
            }

            const updatedGroup = await this.groupsModel.updateGroup({
                updatedByUserUuid: null,
                groupUuid,
                update: {
                    name: groupToUpdate.displayName,
                    ...(groupToUpdate.members !== undefined
                        ? {
                              members: groupToUpdate.members.map((member) => ({
                                  userUuid: member.value,
                              })),
                          }
                        : {}),
                },
            });

            this.logger.debug('SCIM: Successfully replaced group', {
                organizationUuid,
                groupUuid,
                oldName: group.name,
                newName: updatedGroup.name,
                oldMemberCount: group.members.length,
                newMemberCount: updatedGroup.memberUuids.length,
            });

            this.analytics.track({
                event: 'group.updated',
                anonymousId: LightdashAnalytics.anonymousId,
                properties: {
                    organizationId: group.organizationUuid,
                    groupId: group.uuid,
                    name: group.name,
                    countUsersInGroup: group.memberUuids.length,
                    viaSso: false,
                    context: 'scim',
                },
            });
            return this.convertLightdashGroupToScimGroup(updatedGroup);
        } catch (error) {
            if (error instanceof ScimError) {
                throw error;
            }
            if (error instanceof NotFoundError) {
                throw new ScimError({
                    detail: `Group with UUID ${groupUuid} not found`,
                    status: 404,
                    scimType: 'noTarget',
                });
            }
            this.logger.error(
                `Failed to replace SCIM group: ${getErrorMessage(error)}`,
            );
            const scimError = new ScimError({
                detail: getErrorMessage(error),
                status: ScimService.getErrorStatus(error) ?? 500,
            });
            Sentry.captureException(scimError);
            throw scimError;
        }
    }

    async updateGroup(
        organizationUuid: string,
        groupUuid: string,
        patchOp: ScimPatch,
    ): Promise<ScimGroup> {
        this.logger.debug('SCIM: Updating group with patch', {
            organizationUuid,
            groupUuid,
            operationsCount: patchOp.Operations.length,
            operations: patchOp.Operations.map((op) => ({
                op: op.op,
                path: op.path,
                hasValue: !!op.value,
            })),
        });
        try {
            const existingGroup = await this.groupsModel.getGroupWithMembers(
                groupUuid,
            );
            if (existingGroup.organizationUuid !== organizationUuid) {
                this.logger.debug(
                    'SCIM: Group not found in organization for patch',
                    {
                        groupUuid,
                        organizationUuid,
                        groupOrgUuid: existingGroup.organizationUuid,
                    },
                );
                throw new ScimError({
                    detail: `Group with UUID ${groupUuid} not found`,
                    status: 404,
                    scimType: 'noTarget',
                });
            }
            const existingScimGroup =
                this.convertLightdashGroupToScimGroup(existingGroup);
            // use lib to construct patched group object
            const patchedScimGroup = scimPatch(
                existingScimGroup,
                patchOp.Operations,
            ) as ScimGroup;
            this.logger.debug('SCIM: Applied patch operations to group', {
                organizationUuid,
                groupUuid,
                oldName: existingGroup.name,
                newName: patchedScimGroup.displayName,
                oldMemberCount: existingGroup.members.length,
                newMemberCount: (patchedScimGroup.members ?? []).length,
            });
            if (!patchedScimGroup.displayName) {
                throw new ScimError({
                    detail: 'displayName is required',
                    status: 400,
                    scimType: 'invalidValue',
                });
            }
            const updatedGroup = await this.groupsModel.updateGroup({
                updatedByUserUuid: null,
                groupUuid,
                update: {
                    name: patchedScimGroup.displayName,
                    ...(patchedScimGroup.members !== undefined
                        ? {
                              members: patchedScimGroup.members.map(
                                  (member) => ({
                                      userUuid: member.value,
                                  }),
                              ),
                          }
                        : {}),
                },
            });

            this.logger.debug('SCIM: Successfully updated group', {
                organizationUuid,
                groupUuid,
                finalName: updatedGroup.name,
                finalMemberCount: updatedGroup.memberUuids.length,
            });

            this.analytics.track({
                event: 'group.updated',
                anonymousId: LightdashAnalytics.anonymousId,
                properties: {
                    organizationId: updatedGroup.organizationUuid,
                    groupId: updatedGroup.uuid,
                    name: updatedGroup.name,
                    countUsersInGroup: updatedGroup.memberUuids.length,
                    viaSso: false,
                    context: 'scim',
                },
            });
            return this.convertLightdashGroupToScimGroup(updatedGroup);
        } catch (error) {
            if (error instanceof ScimError) {
                switch (error.constructor) {
                    case ParameterError:
                    case InvalidScimPatchRequest:
                        throw new ScimError({
                            detail: error.message,
                            status: 400,
                            scimType: 'invalidValue',
                        });
                    case NotFoundError:
                        throw new ScimError({
                            detail: `Group with UUID ${groupUuid} not found`,
                            status: 404,
                            scimType: 'noTarget',
                        });
                    case ScimError:
                        throw error; // pass through scim errors
                    default:
                        this.logger.error(
                            `Failed to patch SCIM group: ${getErrorMessage(
                                error,
                            )}`,
                        );
                        const scimError = new ScimError({
                            detail: 'Failed to patch SCIM group',
                            status: ScimService.getErrorStatus(error) ?? 500,
                        });
                        Sentry.captureException(scimError);
                        throw scimError;
                }
            }
            throw new ScimError({
                detail: 'Failed to patch SCIM group: unknown error',
                status: ScimService.getErrorStatus(error) ?? 500,
            });
        }
    }

    async deleteGroup(
        organizationUuid: string,
        groupUuid: string,
    ): Promise<void> {
        this.logger.debug('SCIM: Deleting group', {
            organizationUuid,
            groupUuid,
        });
        try {
            const group = await this.groupsModel.getGroup(groupUuid);
            if (group.organizationUuid !== organizationUuid) {
                this.logger.debug(
                    'SCIM: Group not found in organization for delete',
                    {
                        groupUuid,
                        organizationUuid,
                        groupOrgUuid: group.organizationUuid,
                    },
                );
                throw new ScimError({
                    detail: `Group with UUID ${groupUuid} not found`,
                    status: 404,
                    scimType: 'noTarget',
                });
            }

            await this.groupsModel.deleteGroup(groupUuid);
            this.logger.debug('SCIM: Successfully deleted group', {
                organizationUuid,
                groupUuid,
                groupName: group.name,
            });
            this.analytics.track({
                event: 'group.deleted',
                anonymousId: LightdashAnalytics.anonymousId,
                properties: {
                    organizationId: group.organizationUuid,
                    groupId: group.uuid,
                    context: 'scim',
                },
            });
        } catch (error) {
            if (error instanceof ScimError) {
                throw error;
            }
            if (error instanceof NotFoundError) {
                throw new ScimError({
                    detail: `Group with UUID ${groupUuid} not found`,
                    status: 404,
                    scimType: 'noTarget',
                });
            }
            this.logger.error(
                `Failed to delete SCIM group: ${getErrorMessage(error)}`,
            );
            const scimError = new ScimError({
                detail: getErrorMessage(error),
                status: ScimService.getErrorStatus(error) ?? 500,
            });
            Sentry.captureException(scimError);
            throw scimError;
        }
    }

    static getServiceProviderConfig(): ScimServiceProviderConfig {
        return {
            schemas: [ScimSchemaType.SERVICE_PROVIDER_CONFIG],
            documentationUri: 'https://docs.lightdash.com/guides/scim',
            patch: {
                supported: true,
            },
            bulk: {
                supported: false,
            },
            filter: {
                supported: true,
                maxResults: 200,
            },
            changePassword: {
                supported: false,
            },
            sort: {
                supported: false,
            },
            etag: {
                supported: false,
            },
            authenticationSchemes: [
                {
                    type: 'oauthbearertoken',
                    name: 'OAuth Bearer Token',
                    description:
                        'Authentication scheme using the OAuth 2.0 Bearer Token standard',
                    primary: true,
                },
            ],
        };
    }

    /**
     * Type-safe mapping of ScimUser interface fields to SCIM schema attributes
     * This ensures all fields from ScimUser are covered and only those fields
     */
    private static buildUserSchemaAttributes(): ScimSchemaAttribute[] {
        // Type-safe field mapping - TypeScript will catch if ScimUser interface changes
        type ScimUserFieldMap = {
            [K in keyof Omit<
                ScimUser,
                | 'schemas'
                | 'id'
                | 'externalId'
                | 'meta'
                | ScimSchemaType.LIGHTDASH_USER_EXTENSION
            >]: ScimSchemaAttribute;
        };

        // These attributes should match the ScimUser interface
        const fieldAttributeMap: ScimUserFieldMap = {
            userName: {
                name: 'userName',
                type: 'string',
                multiValued: false,
                description:
                    'Unique identifier for the User, typically used for login',
                required: true,
                caseExact: false,
                mutability: 'readWrite',
                returned: 'default',
                uniqueness: 'server',
            },
            name: {
                name: 'name',
                type: 'complex',
                multiValued: false,
                description: "The components of the user's real name",
                required: false,
                caseExact: false,
                mutability: 'readWrite',
                returned: 'default',
                uniqueness: 'none',
                subAttributes: [
                    {
                        name: 'givenName',
                        type: 'string',
                        multiValued: false,
                        description:
                            'The given name of the User, or first name',
                        required: false,
                        caseExact: false,
                        mutability: 'readWrite',
                        returned: 'default',
                        uniqueness: 'none',
                    },
                    {
                        name: 'familyName',
                        type: 'string',
                        multiValued: false,
                        description:
                            'The family name of the User, or last name',
                        required: false,
                        caseExact: false,
                        mutability: 'readWrite',
                        returned: 'default',
                        uniqueness: 'none',
                    },
                ],
            },
            active: {
                name: 'active',
                type: 'boolean',
                multiValued: false,
                description:
                    "A Boolean value indicating the User's administrative status",
                required: false,
                caseExact: false,
                mutability: 'readWrite',
                returned: 'default',
                uniqueness: 'none',
            },
            emails: {
                name: 'emails',
                type: 'complex',
                multiValued: true,
                description: 'Email addresses for the user',
                required: false,
                caseExact: false,
                mutability: 'readWrite',
                returned: 'default',
                uniqueness: 'none',
                subAttributes: [
                    {
                        name: 'value',
                        type: 'string',
                        multiValued: false,
                        description: 'Email address for the User',
                        required: true,
                        caseExact: false,
                        mutability: 'readWrite',
                        returned: 'default',
                        uniqueness: 'none',
                    },
                    {
                        name: 'primary',
                        type: 'boolean',
                        multiValued: false,
                        description:
                            'A Boolean value indicating the primary email address',
                        required: false,
                        caseExact: false,
                        mutability: 'readWrite',
                        returned: 'default',
                        uniqueness: 'none',
                    },
                ],
            },
        };

        // Return all attributes as array - TypeScript ensures all ScimUser fields are covered
        return Object.values(fieldAttributeMap);
    }

    static getSchemas(): ScimListResponse<ScimSchema> {
        const userSchema: ScimSchema = {
            schemas: [ScimSchemaType.SCHEMA],
            id: ScimSchemaType.USER,
            name: 'User',
            description: 'User Schema - Lightdash supported attributes',
            attributes: this.buildUserSchemaAttributes(),
        };

        // These attributes should match the ScimGroup interface
        const groupSchema: ScimSchema = {
            schemas: [ScimSchemaType.SCHEMA],
            id: ScimSchemaType.GROUP,
            name: 'Group',
            description: 'Group Schema',
            attributes: [
                {
                    name: 'displayName',
                    type: 'string',
                    multiValued: false,
                    description: 'A human-readable name for the Group',
                    required: true,
                    caseExact: false,
                    mutability: 'readWrite',
                    returned: 'default',
                    uniqueness: 'none',
                },
                {
                    name: 'members',
                    type: 'complex',
                    multiValued: true,
                    description: 'A list of members of the Group',
                    required: false,
                    caseExact: false,
                    mutability: 'readWrite',
                    returned: 'default',
                    uniqueness: 'none',
                    subAttributes: [
                        {
                            name: 'value',
                            type: 'string',
                            multiValued: false,
                            description:
                                'Identifier of the member of this Group',
                            required: true,
                            caseExact: false,
                            mutability: 'readWrite',
                            returned: 'default',
                            uniqueness: 'none',
                        },
                        {
                            name: 'display',
                            type: 'string',
                            multiValued: false,
                            description:
                                'A human-readable name for the Group member',
                            required: false,
                            caseExact: false,
                            mutability: 'readWrite',
                            returned: 'default',
                            uniqueness: 'none',
                        },
                    ],
                },
            ],
        };

        const lightdashUserExtensionSchema: ScimSchema = {
            schemas: [ScimSchemaType.SCHEMA],
            id: ScimSchemaType.LIGHTDASH_USER_EXTENSION,
            name: 'Lightdash User Extension',
            description: 'Lightdash-specific User attributes',
            attributes: [
                {
                    name: 'role',
                    type: 'string',
                    multiValued: false,
                    description: 'Role of the user in the organization',
                    required: false,
                    canonicalValues: [
                        'admin',
                        'editor',
                        'interactive_viewer',
                        'viewer',
                    ],
                    caseExact: false,
                    mutability: 'readWrite',
                    returned: 'default',
                    uniqueness: 'none',
                },
            ],
        };

        const serviceProviderConfigSchema: ScimSchema = {
            schemas: [ScimSchemaType.SCHEMA],
            id: ScimSchemaType.SERVICE_PROVIDER_CONFIG,
            name: 'Service Provider Configuration',
            description:
                "Schema for representing the service provider's configuration",
            attributes: [
                {
                    name: 'documentationUri',
                    type: 'reference',
                    multiValued: false,
                    description:
                        "An HTTP-addressable URL pointing to the service provider's human-consumable help documentation",
                    required: false,
                    caseExact: false,
                    mutability: 'readOnly',
                    returned: 'default',
                    uniqueness: 'none',
                },
                {
                    name: 'patch',
                    type: 'complex',
                    multiValued: false,
                    description:
                        'A complex type that specifies PATCH configuration options',
                    required: true,
                    caseExact: false,
                    mutability: 'readOnly',
                    returned: 'default',
                    uniqueness: 'none',
                    subAttributes: [
                        {
                            name: 'supported',
                            type: 'boolean',
                            multiValued: false,
                            description:
                                'A Boolean value specifying whether or not the operation is supported',
                            required: true,
                            caseExact: false,
                            mutability: 'readOnly',
                            returned: 'default',
                            uniqueness: 'none',
                        },
                    ],
                },
                {
                    name: 'bulk',
                    type: 'complex',
                    multiValued: false,
                    description:
                        'A complex type that specifies bulk configuration options',
                    required: true,
                    caseExact: false,
                    mutability: 'readOnly',
                    returned: 'default',
                    uniqueness: 'none',
                    subAttributes: [
                        {
                            name: 'supported',
                            type: 'boolean',
                            multiValued: false,
                            description:
                                'A Boolean value specifying whether or not the operation is supported',
                            required: true,
                            caseExact: false,
                            mutability: 'readOnly',
                            returned: 'default',
                            uniqueness: 'none',
                        },
                        {
                            name: 'maxOperations',
                            type: 'integer',
                            multiValued: false,
                            description:
                                'An integer value specifying the maximum number of operations',
                            required: false,
                            caseExact: false,
                            mutability: 'readOnly',
                            returned: 'default',
                            uniqueness: 'none',
                        },
                        {
                            name: 'maxPayloadSize',
                            type: 'integer',
                            multiValued: false,
                            description:
                                'An integer value specifying the maximum payload size in bytes',
                            required: false,
                            caseExact: false,
                            mutability: 'readOnly',
                            returned: 'default',
                            uniqueness: 'none',
                        },
                    ],
                },
                {
                    name: 'filter',
                    type: 'complex',
                    multiValued: false,
                    description: 'A complex type that specifies FILTER options',
                    required: true,
                    caseExact: false,
                    mutability: 'readOnly',
                    returned: 'default',
                    uniqueness: 'none',
                    subAttributes: [
                        {
                            name: 'supported',
                            type: 'boolean',
                            multiValued: false,
                            description:
                                'A Boolean value specifying whether or not the operation is supported',
                            required: true,
                            caseExact: false,
                            mutability: 'readOnly',
                            returned: 'default',
                            uniqueness: 'none',
                        },
                        {
                            name: 'maxResults',
                            type: 'integer',
                            multiValued: false,
                            description:
                                'An integer value specifying the maximum number of resources returned',
                            required: false,
                            caseExact: false,
                            mutability: 'readOnly',
                            returned: 'default',
                            uniqueness: 'none',
                        },
                    ],
                },
                {
                    name: 'changePassword',
                    type: 'complex',
                    multiValued: false,
                    description:
                        'A complex type that specifies configuration options related to changing a password',
                    required: true,
                    caseExact: false,
                    mutability: 'readOnly',
                    returned: 'default',
                    uniqueness: 'none',
                    subAttributes: [
                        {
                            name: 'supported',
                            type: 'boolean',
                            multiValued: false,
                            description:
                                'A Boolean value specifying whether or not the operation is supported',
                            required: true,
                            caseExact: false,
                            mutability: 'readOnly',
                            returned: 'default',
                            uniqueness: 'none',
                        },
                    ],
                },
                {
                    name: 'sort',
                    type: 'complex',
                    multiValued: false,
                    description:
                        'A complex type that specifies sort result options',
                    required: true,
                    caseExact: false,
                    mutability: 'readOnly',
                    returned: 'default',
                    uniqueness: 'none',
                    subAttributes: [
                        {
                            name: 'supported',
                            type: 'boolean',
                            multiValued: false,
                            description:
                                'A Boolean value specifying whether or not sorting is supported',
                            required: true,
                            caseExact: false,
                            mutability: 'readOnly',
                            returned: 'default',
                            uniqueness: 'none',
                        },
                    ],
                },
                {
                    name: 'etag',
                    type: 'complex',
                    multiValued: false,
                    description:
                        'A complex type that specifies ETag configuration options',
                    required: true,
                    caseExact: false,
                    mutability: 'readOnly',
                    returned: 'default',
                    uniqueness: 'none',
                    subAttributes: [
                        {
                            name: 'supported',
                            type: 'boolean',
                            multiValued: false,
                            description:
                                'A Boolean value specifying whether or not the operation is supported',
                            required: true,
                            caseExact: false,
                            mutability: 'readOnly',
                            returned: 'default',
                            uniqueness: 'none',
                        },
                    ],
                },
                {
                    name: 'authenticationSchemes',
                    type: 'complex',
                    multiValued: true,
                    description:
                        'A multi-valued complex type that specifies supported authentication scheme properties',
                    required: true,
                    caseExact: false,
                    mutability: 'readOnly',
                    returned: 'default',
                    uniqueness: 'none',
                    subAttributes: [
                        {
                            name: 'type',
                            type: 'string',
                            multiValued: false,
                            description: 'The authentication scheme type',
                            required: true,
                            caseExact: false,
                            mutability: 'readOnly',
                            returned: 'default',
                            uniqueness: 'none',
                        },
                        {
                            name: 'name',
                            type: 'string',
                            multiValued: false,
                            description:
                                'The common authentication scheme name',
                            required: true,
                            caseExact: false,
                            mutability: 'readOnly',
                            returned: 'default',
                            uniqueness: 'none',
                        },
                        {
                            name: 'description',
                            type: 'string',
                            multiValued: false,
                            description:
                                'A description of the authentication scheme',
                            required: true,
                            caseExact: false,
                            mutability: 'readOnly',
                            returned: 'default',
                            uniqueness: 'none',
                        },
                        {
                            name: 'specUri',
                            type: 'reference',
                            multiValued: false,
                            description:
                                'An HTTP-addressable URL pointing to the authentication scheme specification',
                            required: false,
                            caseExact: false,
                            mutability: 'readOnly',
                            returned: 'default',
                            uniqueness: 'none',
                        },
                        {
                            name: 'documentationUri',
                            type: 'reference',
                            multiValued: false,
                            description:
                                'An HTTP-addressable URL pointing to the authentication scheme usage documentation',
                            required: false,
                            caseExact: false,
                            mutability: 'readOnly',
                            returned: 'default',
                            uniqueness: 'none',
                        },
                        {
                            name: 'primary',
                            type: 'boolean',
                            multiValued: false,
                            description:
                                'A Boolean value indicating the primary authentication scheme',
                            required: false,
                            caseExact: false,
                            mutability: 'readOnly',
                            returned: 'default',
                            uniqueness: 'none',
                        },
                    ],
                },
            ],
        };

        const resourceTypeSchema: ScimSchema = {
            schemas: [ScimSchemaType.SCHEMA],
            id: ScimSchemaType.RESOURCE_TYPE,
            name: 'Resource Type',
            description:
                'Specifies the schema that describes a SCIM resource type',
            attributes: [
                {
                    name: 'id',
                    type: 'string',
                    multiValued: false,
                    description: "The resource type's server unique id",
                    required: false,
                    caseExact: false,
                    mutability: 'readOnly',
                    returned: 'default',
                    uniqueness: 'none',
                },
                {
                    name: 'name',
                    type: 'string',
                    multiValued: false,
                    description: 'The resource type name',
                    required: true,
                    caseExact: false,
                    mutability: 'readOnly',
                    returned: 'default',
                    uniqueness: 'none',
                },
                {
                    name: 'description',
                    type: 'string',
                    multiValued: false,
                    description:
                        "The resource type's human-readable description",
                    required: false,
                    caseExact: false,
                    mutability: 'readOnly',
                    returned: 'default',
                    uniqueness: 'none',
                },
                {
                    name: 'endpoint',
                    type: 'reference',
                    multiValued: false,
                    description:
                        "The resource type's HTTP-addressable endpoint relative to the Base URL",
                    required: true,
                    caseExact: false,
                    mutability: 'readOnly',
                    returned: 'default',
                    uniqueness: 'none',
                },
                {
                    name: 'schema',
                    type: 'reference',
                    multiValued: false,
                    description: "The resource type's primary/base schema URI",
                    required: true,
                    caseExact: false,
                    mutability: 'readOnly',
                    returned: 'default',
                    uniqueness: 'none',
                },
                {
                    name: 'schemaExtensions',
                    type: 'complex',
                    multiValued: true,
                    description:
                        "A list of URIs of the resource type's schema extensions",
                    required: false,
                    caseExact: false,
                    mutability: 'readOnly',
                    returned: 'default',
                    uniqueness: 'none',
                    subAttributes: [
                        {
                            name: 'schema',
                            type: 'reference',
                            multiValued: false,
                            description: 'The URI of a schema extension',
                            required: true,
                            caseExact: false,
                            mutability: 'readOnly',
                            returned: 'default',
                            uniqueness: 'none',
                        },
                        {
                            name: 'required',
                            type: 'boolean',
                            multiValued: false,
                            description:
                                'A Boolean value that specifies whether or not the schema extension is required',
                            required: true,
                            caseExact: false,
                            mutability: 'readOnly',
                            returned: 'default',
                            uniqueness: 'none',
                        },
                    ],
                },
            ],
        };

        const schemas = [
            userSchema,
            groupSchema,
            lightdashUserExtensionSchema,
            serviceProviderConfigSchema,
            resourceTypeSchema,
        ];

        return {
            schemas: [ScimSchemaType.LIST_RESPONSE],
            totalResults: schemas.length,
            itemsPerPage: schemas.length,
            startIndex: 1,
            Resources: schemas,
        };
    }

    static getResourceTypes(): ScimListResponse<ScimResourceType> {
        // Get base URL from environment or use default
        const baseUrl = process.env.SITE_URL || 'http://localhost:8080';

        const resources: ScimResourceType[] = [
            {
                schemas: [ScimSchemaType.RESOURCE_TYPE],
                id: 'User',
                name: 'User',
                description: 'User Account',
                endpoint: '/Users',
                schema: ScimSchemaType.USER,
                schemaExtensions: [
                    {
                        schema: ScimSchemaType.LIGHTDASH_USER_EXTENSION,
                        required: false,
                    },
                ],
                meta: {
                    resourceType: 'ResourceType',
                    location: `${baseUrl}/api/v1/scim/v2/ResourceTypes/User`,
                },
            },
            {
                schemas: [ScimSchemaType.RESOURCE_TYPE],
                id: 'Group',
                name: 'Group',
                description: 'Group',
                endpoint: '/Groups',
                schema: ScimSchemaType.GROUP,
                meta: {
                    resourceType: 'ResourceType',
                    location: `${baseUrl}/api/v1/scim/v2/ResourceTypes/Group`,
                },
            },
        ];

        return {
            schemas: [ScimSchemaType.LIST_RESPONSE],
            totalResults: resources.length,
            itemsPerPage: resources.length,
            startIndex: 1,
            Resources: resources,
        };
    }
}
