import { subject } from '@casl/ability';
import {
    Account,
    CreateUserAttribute,
    ForbiddenError,
    RequestMethod,
    UserAttribute,
} from '@lightdash/common';
import {
    LightdashAnalytics,
    UserAttributeCreateAndUpdateEvent,
} from '../../analytics/LightdashAnalytics';
import { UserAttributesModel } from '../../models/UserAttributesModel';
import { BaseService } from '../BaseService';

type UserAttributesServiceArguments = {
    analytics: LightdashAnalytics;
    userAttributesModel: UserAttributesModel;
};

export class UserAttributesService extends BaseService {
    private readonly analytics: LightdashAnalytics;

    private readonly userAttributesModel: UserAttributesModel;

    constructor(args: UserAttributesServiceArguments) {
        super();
        this.analytics = args.analytics;
        this.userAttributesModel = args.userAttributesModel;
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
                values: attribute.users.map((u) => u.value),
                groupIds: attribute.groups.map((g) => g.groupUuid),
                groupValues: attribute.groups.map((g) => g.value),
            },
            defaultValue: attribute.attributeDefault,
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
