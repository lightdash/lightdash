import { subject } from '@casl/ability';
import {
    CreateUserAttribute,
    ForbiddenError,
    RequestMethod,
    SessionUser,
    UserAttribute,
} from '@lightdash/common';
import { analytics } from '../../analytics/client';
import { UserAttributeCreateAndUpdateEvent } from '../../analytics/LightdashAnalytics';
import { UserAttributesModel } from '../../models/UserAttributesModel';

type Dependencies = {
    userAttributesModel: UserAttributesModel;
};

export class UserAttributesService {
    private readonly userAttributesModel: UserAttributesModel;

    constructor(dependencies: Dependencies) {
        this.userAttributesModel = dependencies.userAttributesModel;
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
        user: SessionUser,
        context: RequestMethod,
    ): Promise<UserAttribute[]> {
        const organizationUuid = user.organizationUuid!;
        if (
            user.ability.cannot(
                'manage',
                subject('Organization', { organizationUuid }),
            )
        ) {
            throw new ForbiddenError();
        }

        const attributes = await this.userAttributesModel.find({
            organizationUuid,
        });

        if (context === RequestMethod.WEB_APP) {
            analytics.track({
                event: 'user_attributes.page_viewed',
                userId: user.userUuid,
                properties: {
                    organizationId: organizationUuid,
                    userAttributesCount: attributes.length,
                },
            });
        }
        return attributes;
    }

    async create(
        user: SessionUser,
        orgAttribute: CreateUserAttribute,
    ): Promise<UserAttribute> {
        const organizationUuid = user.organizationUuid!;

        if (
            user.ability.cannot(
                'manage',
                subject('Organization', { organizationUuid }),
            )
        ) {
            throw new ForbiddenError();
        }
        const createdAttribute = await this.userAttributesModel.create(
            organizationUuid,
            orgAttribute,
        );

        analytics.track({
            event: 'user_attribute.created',
            userId: user.userUuid,
            properties:
                UserAttributesService.getAnalyticsEventProperties(
                    createdAttribute,
                ),
        });

        return createdAttribute;
    }

    async update(
        user: SessionUser,
        orgAttributeUuid: string,
        orgAttribute: CreateUserAttribute,
    ): Promise<UserAttribute> {
        const savedAttribute = await this.userAttributesModel.get(
            orgAttributeUuid,
        );

        if (
            user.ability.cannot(
                'manage',
                subject('Organization', {
                    organizationUuid: savedAttribute.organizationUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }
        const updatedAttribute = await this.userAttributesModel.update(
            user.organizationUuid!,
            orgAttributeUuid,
            orgAttribute,
        );

        analytics.track({
            event: 'user_attribute.updated',
            userId: user.userUuid,
            properties:
                UserAttributesService.getAnalyticsEventProperties(
                    updatedAttribute,
                ),
        });

        return updatedAttribute;
    }

    async delete(user: SessionUser, orgAttributeUuid: string): Promise<void> {
        const orgAttribute = await this.userAttributesModel.get(
            orgAttributeUuid,
        );
        if (
            user.ability.cannot(
                'manage',
                subject('Organization', {
                    organizationUuid: orgAttribute.organizationUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }
        await this.userAttributesModel.delete(orgAttributeUuid);

        analytics.track({
            event: 'user_attribute.deleted',
            userId: user.userUuid,
            properties: {
                organizationId: orgAttribute.organizationUuid,
                attributeId: orgAttributeUuid,
            },
        });
    }
}
