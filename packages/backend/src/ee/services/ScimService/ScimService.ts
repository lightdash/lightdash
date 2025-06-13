import { subject } from '@casl/ability';
import {
    AlreadyExistsError,
    CommercialFeatureFlags,
    ForbiddenError,
    getErrorMessage,
    GroupWithMembers,
    isValidEmailAddress,
    LightdashUser,
    NotFoundError,
    OrganizationMemberProfile,
    OrganizationMemberRole,
    ParameterError,
    ScimError,
    ScimGroup,
    ScimListResponse,
    ScimSchemaType,
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
import Logger from '../../../logging/logger';
import { EmailModel } from '../../../models/EmailModel';
import { GroupsModel } from '../../../models/GroupsModel';
import { OrganizationMemberProfileModel } from '../../../models/OrganizationMemberProfileModel';
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

    constructor({
        lightdashConfig,
        organizationMemberProfileModel,
        userModel,
        emailModel,
        analytics,
        groupsModel,
        serviceAccountModel,
        commercialFeatureFlagModel,
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

        return {
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
        try {
            const user =
                await this.organizationMemberProfileModel.getOrganizationMemberByUuid(
                    organizationUuid,
                    userUuid,
                );
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
            Logger.error(
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
        try {
            const parsedFilter = filter ? parse(filter) : null;

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

            return {
                schemas: [ScimSchemaType.LIST_RESPONSE],
                totalResults: pagination?.totalResults ?? 0,
                itemsPerPage: pagination?.pageSize ?? 0,
                startIndex,
                Resources: scimUsers,
            };
        } catch (error) {
            Logger.error(
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
            // Add user to organization
            await this.organizationMemberProfileModel.createOrganizationMembershipByUuid(
                {
                    organizationUuid,
                    userUuid: dbUser.userUuid,
                    role: OrganizationMemberRole.MEMBER,
                },
            );
            // verify user email on create if coming from scim
            await this.emailModel.verifyUserEmailIfExists(
                dbUser.userUuid,
                email,
            );
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
            Logger.error(
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
                    firstName: user.name.givenName || dbUser.firstName,
                    lastName: user.name.familyName || dbUser.lastName,
                    email: emailToUpdate,
                    isActive: user.active ?? dbUser.isActive,
                },
            );
            this.analytics.track({
                event: 'user.updated',
                anonymousId: LightdashAnalytics.anonymousId,
                properties: {
                    ...updatedUser,
                    updatedUserId: updatedUser.userUuid,
                    organizationId: updatedUser.organizationUuid,
                    context: 'scim',
                },
            });
            // Construct SCIM-compliant response
            return this.convertLightdashUserToScimUser(updatedUser);
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
            Logger.error(
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
                        Logger.error(
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
                throw new ParameterError(
                    'Organization must have at least one admin',
                );
            }

            await this.userModel.delete(dbUser.userUuid);

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
            Logger.error(
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
        try {
            const group = await this.groupsModel.getGroupWithMembers(groupUuid);
            if (group.organizationUuid !== organizationUuid) {
                throw new ScimError({
                    detail: `Group with UUID ${groupUuid} not found`,
                    status: 404,
                    scimType: 'noTarget',
                });
            }
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
            Logger.error(
                `Failed to retrieve SCIM user: ${getErrorMessage(error)}`,
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
        try {
            const parsedFilter = filter ? parse(filter) : null;

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

            return {
                schemas: [ScimSchemaType.LIST_RESPONSE],
                totalResults: pagination?.totalResults ?? 0,
                itemsPerPage: pagination?.pageSize ?? 0,
                startIndex,
                Resources: scimGroups,
            };
        } catch (error) {
            Logger.error(
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
                    members: groupToCreate.members.map((member) => ({
                        userUuid: member.value,
                    })),
                },
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
            Logger.error(
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
                    members: groupToUpdate.members.map((member) => ({
                        userUuid: member.value,
                    })),
                },
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
            Logger.error(
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
        try {
            const existingGroup = await this.groupsModel.getGroupWithMembers(
                groupUuid,
            );
            if (existingGroup.organizationUuid !== organizationUuid) {
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
                    members: patchedScimGroup.members.map((member) => ({
                        userUuid: member.value,
                    })),
                },
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
                        Logger.error(
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
        try {
            const group = await this.groupsModel.getGroup(groupUuid);
            if (group.organizationUuid !== organizationUuid) {
                throw new ScimError({
                    detail: `Group with UUID ${groupUuid} not found`,
                    status: 404,
                    scimType: 'noTarget',
                });
            }

            await this.groupsModel.deleteGroup(groupUuid);
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
            Logger.error(
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
}
