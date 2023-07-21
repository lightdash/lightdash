import { subject } from '@casl/ability';
import {
    CreateUserAttribute,
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
        const organizationUuid = user.organizationUuid!;
        if (
            user.ability.cannot(
                'manage',
                subject('Organization', { organizationUuid }),
            )
        ) {
            throw new ForbiddenError();
        }

        return this.userAttributesModel.find({
            organizationUuid,
        });
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
        return this.userAttributesModel.create(organizationUuid, orgAttribute);
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

    static async replaceUserAttributes(
        sqlFilter: string,
        userAttributes: UserAttribute[],
    ): Promise<string> {
        const userAttributeRegex =
            /\$\{(?:lightdash|ld)\.(?:attribute|attr)\.(\w+)\}/g;
        const sqlAttributes = await sqlFilter.match(userAttributeRegex);

        if (sqlAttributes === null || sqlAttributes.length === 0) {
            return sqlFilter;
        }

        const sq = sqlAttributes.reduce<string>((acc, sqlAttribute) => {
            const attribute = sqlAttribute.replace(userAttributeRegex, '$1');
            const userAttribute = userAttributes.find(
                (ua) => ua.name === attribute,
            );
            if (userAttribute === undefined) {
                throw new ForbiddenError(
                    `Missing user attribute "${attribute}" on sqlFilter "${sqlFilter}"`,
                );
            }
            if (userAttribute.users.length !== 1) {
                throw new ForbiddenError(
                    `Invalid or missing user attribute "${attribute}" on sqlFilter "${sqlFilter}"`,
                );
            }
            return acc.replace(sqlAttribute, userAttribute.users[0].value);
        }, sqlFilter);

        return sq;
    }
}
