import { subject } from '@casl/ability';
import {
    Account,
    ApiUserAttributeAsCodeUpsertResponse,
    assertRegisteredAccount,
    CreateUserAttribute,
    ForbiddenError,
    Group,
    ParameterError,
    parseUserAttributeAsCode,
    PromotionAction,
    RequestMethod,
    UserAttribute,
    UserAttributeAsCode,
    validateEmail,
} from '@lightdash/common';
import { isEqual } from 'lodash';
import {
    LightdashAnalytics,
    UserAttributeCreateAndUpdateEvent,
} from '../../analytics/LightdashAnalytics';
import { GroupsModel } from '../../models/GroupsModel';
import { OrganizationMemberProfileModel } from '../../models/OrganizationMemberProfileModel';
import { UserAttributesModel } from '../../models/UserAttributesModel';
import { BaseService } from '../BaseService';

type UserAttributesServiceArguments = {
    analytics: LightdashAnalytics;
    userAttributesModel: UserAttributesModel;
    groupsModel: GroupsModel;
    organizationMemberProfileModel: OrganizationMemberProfileModel;
};

export class UserAttributesService extends BaseService {
    private readonly analytics: LightdashAnalytics;

    private readonly userAttributesModel: UserAttributesModel;

    private readonly groupsModel: GroupsModel;

    private readonly organizationMemberProfileModel: OrganizationMemberProfileModel;

    constructor(args: UserAttributesServiceArguments) {
        super();
        this.analytics = args.analytics;
        this.userAttributesModel = args.userAttributesModel;
        this.groupsModel = args.groupsModel;
        this.organizationMemberProfileModel =
            args.organizationMemberProfileModel;
    }

    private validateAsCodeAccess(
        account: Account,
        organizationUuid: string,
    ): void {
        assertRegisteredAccount(account);
        if (
            account.organization.organizationUuid !== organizationUuid ||
            this.createAuditedAbility(account).cannot(
                'manage',
                subject('Organization', { organizationUuid }),
            )
        ) {
            throw new ForbiddenError();
        }
    }

    private static toAsCode(
        attribute: UserAttribute,
        groups: Group[],
    ): UserAttributeAsCode {
        return parseUserAttributeAsCode(
            {
                version: 1,
                name: attribute.name,
                description: attribute.description ?? null,
                attributeDefaults: attribute.attributeDefaults,
                users: attribute.users.map(({ email, values }) => ({
                    email,
                    values,
                })),
                groups: attribute.groups.map(({ groupUuid, values }) => {
                    const group = groups.find(({ uuid }) => uuid === groupUuid);
                    if (!group) {
                        throw new ParameterError(
                            `Cannot resolve group for user attribute "${attribute.name}"`,
                        );
                    }
                    return { name: group.name, values };
                }),
            },
            'stored user attribute',
        );
    }

    async getUserAttributesAsCode(
        account: Account,
        organizationUuid: string,
    ): Promise<UserAttributeAsCode[]> {
        this.validateAsCodeAccess(account, organizationUuid);
        const [attributes, { data: groups }] = await Promise.all([
            this.userAttributesModel.find({ organizationUuid }),
            this.groupsModel.find({ organizationUuid }),
        ]);
        return attributes
            .map((attribute) =>
                UserAttributesService.toAsCode(attribute, groups),
            )
            .sort((a, b) => a.name.localeCompare(b.name));
    }

    async upsertUserAttributeAsCode(
        account: Account,
        organizationUuid: string,
        input: UserAttributeAsCode,
    ): Promise<ApiUserAttributeAsCodeUpsertResponse['results']> {
        this.validateAsCodeAccess(account, organizationUuid);
        const document = parseUserAttributeAsCode(input, 'request body');
        for (const { email } of document.users) {
            if (!validateEmail(email))
                throw new ParameterError(
                    `Invalid user attribute email: ${email}`,
                );
        }
        const [attributes, { data: groups }, members] = await Promise.all([
            this.userAttributesModel.find({ organizationUuid }),
            this.groupsModel.find({ organizationUuid }),
            this.organizationMemberProfileModel.findOrganizationMembersByEmails(
                organizationUuid,
                document.users.map(({ email }) => email),
            ),
        ]);
        const attribute: CreateUserAttribute = {
            name: document.name,
            description: document.description ?? '',
            attributeDefaults: document.attributeDefaults,
            users: document.users.map(({ email, values }) => {
                const matches = members.filter(
                    (member) => member.email.toLowerCase() === email,
                );
                if (matches.length !== 1)
                    throw new ParameterError(
                        `Unknown or ambiguous organization user: ${email}`,
                    );
                return { userUuid: matches[0].userUuid, values };
            }),
            groups: document.groups.map(({ name, values }) => {
                const matches = groups.filter((group) => group.name === name);
                if (matches.length !== 1)
                    throw new ParameterError(
                        `Unknown or ambiguous organization group: ${name}`,
                    );
                return { groupUuid: matches[0].uuid, values };
            }),
        };
        const existing = attributes.find(({ name }) => name === document.name);
        if (!existing) {
            await this.create(account, attribute);
            return { action: PromotionAction.CREATE };
        }
        if (
            isEqual(UserAttributesService.toAsCode(existing, groups), document)
        ) {
            return { action: PromotionAction.NO_CHANGES };
        }
        await this.update(account, existing.uuid, attribute);
        return { action: PromotionAction.UPDATE };
    }

    static getAnalyticsEventProperties(
        attribute: UserAttribute,
    ): UserAttributeCreateAndUpdateEvent['properties'] {
        return {
            organizationId: attribute.organizationUuid,
            attributeId: attribute.uuid,
            name: attribute.name,
            description: attribute.description,
            values: {
                userIds: attribute.users.map((u) => u.userUuid),
                values: attribute.users.flatMap((u) => u.values),
                groupIds: attribute.groups.map((g) => g.groupUuid),
                groupValues: attribute.groups.flatMap((g) => g.values),
            },
            defaultValue: attribute.attributeDefaults,
        };
    }

    async getAll(
        account: Account,
        context: RequestMethod,
    ): Promise<UserAttribute[]> {
        const organizationUuid = account.organization.organizationUuid!;
        const auditedAbility = this.createAuditedAbility(account);
        if (
            auditedAbility.cannot(
                'manage',
                subject('Organization', {
                    organizationUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        const attributes = await this.userAttributesModel.find({
            organizationUuid,
        });

        if (context === RequestMethod.WEB_APP) {
            this.analytics.track({
                event: 'user_attributes.page_viewed',
                userId: account.user.id,
                properties: {
                    organizationId: organizationUuid,
                    userAttributesCount: attributes.length,
                },
            });
        }
        return attributes;
    }

    async create(
        account: Account,
        orgAttribute: CreateUserAttribute,
    ): Promise<UserAttribute> {
        const organizationUuid = account.organization.organizationUuid!;
        const auditedAbility = this.createAuditedAbility(account);

        if (
            auditedAbility.cannot(
                'manage',
                subject('Organization', {
                    organizationUuid,
                    metadata: {
                        userAttributeName: orgAttribute.name,
                    },
                }),
            )
        ) {
            throw new ForbiddenError();
        }
        const createdAttribute = await this.userAttributesModel.create(
            organizationUuid,
            orgAttribute,
        );

        this.analytics.track({
            event: 'user_attribute.created',
            userId: account.user.id,
            properties:
                UserAttributesService.getAnalyticsEventProperties(
                    createdAttribute,
                ),
        });

        return createdAttribute;
    }

    async update(
        account: Account,
        orgAttributeUuid: string,
        orgAttribute: CreateUserAttribute,
    ): Promise<UserAttribute> {
        const savedAttribute =
            await this.userAttributesModel.get(orgAttributeUuid);
        const auditedAbility = this.createAuditedAbility(account);

        if (
            auditedAbility.cannot(
                'manage',
                subject('Organization', {
                    organizationUuid: savedAttribute.organizationUuid,
                    metadata: {
                        userAttributeUuid: orgAttributeUuid,
                        userAttributeName: savedAttribute.name,
                    },
                }),
            )
        ) {
            throw new ForbiddenError();
        }
        const updatedAttribute = await this.userAttributesModel.update(
            account.organization.organizationUuid!,
            orgAttributeUuid,
            orgAttribute,
        );

        this.analytics.track({
            event: 'user_attribute.updated',
            userId: account.user.id,
            properties:
                UserAttributesService.getAnalyticsEventProperties(
                    updatedAttribute,
                ),
        });

        return updatedAttribute;
    }

    async delete(account: Account, orgAttributeUuid: string): Promise<void> {
        const orgAttribute =
            await this.userAttributesModel.get(orgAttributeUuid);
        const auditedAbility = this.createAuditedAbility(account);
        if (
            auditedAbility.cannot(
                'manage',
                subject('Organization', {
                    organizationUuid: orgAttribute.organizationUuid,
                    metadata: {
                        userAttributeUuid: orgAttributeUuid,
                        userAttributeName: orgAttribute.name,
                    },
                }),
            )
        ) {
            throw new ForbiddenError();
        }
        await this.userAttributesModel.delete(orgAttributeUuid);

        this.analytics.track({
            event: 'user_attribute.deleted',
            userId: account.user.id,
            properties: {
                organizationId: orgAttribute.organizationUuid,
                attributeId: orgAttributeUuid,
            },
        });
    }
}
