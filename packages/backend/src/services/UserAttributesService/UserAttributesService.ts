import { subject } from '@casl/ability';
import {
    CreateOrgAttribute,
    ForbiddenError,
    SessionUser,
    UserAttribute,
} from '@lightdash/common';
import { UserAttributesModel } from '../../models/UserAttributesModel';

type Dependencies = {
    userAttributesModel: UserAttributesModel;
};

export class UserAttributesService {
    private readonly userAttributesModel: UserAttributesModel;

    constructor(dependencies: Dependencies) {
        this.userAttributesModel = dependencies.userAttributesModel;
    }

    async getAll(user: SessionUser): Promise<UserAttribute[]> {
        if (user.ability.cannot('manage', 'Organization')) {
            throw new ForbiddenError();
        }

        return this.userAttributesModel.find({
            organizationUuid: user.organizationUuid!,
        });
    }

    async create(
        user: SessionUser,
        orgAttribute: CreateOrgAttribute,
    ): Promise<UserAttribute> {
        if (user.ability.cannot('manage', 'Organization')) {
            throw new ForbiddenError();
        }
        return this.userAttributesModel.create(
            user.organizationUuid!,
            orgAttribute,
        );
    }

    async update(
        user: SessionUser,
        orgAttributeUuid: string,
        orgAttribute: CreateOrgAttribute,
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
        return this.userAttributesModel.update(
            user.organizationUuid!,
            orgAttributeUuid,
            orgAttribute,
        );
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
    }
}
