import { subject } from '@casl/ability';
import {
    CatalogField,
    CatalogTable,
    CatalogType,
    ForbiddenError,
    SessionUser,
    type KnexPaginatedData,
    type TablesConfiguration,
    type UserAttributeValueMap,
} from '@lightdash/common';
import { CatalogService } from '../../services/CatalogService/CatalogService';
import { CommercialCatalogModel } from '../models/CommercialCatalogModel';

export class CommercialCatalogService<
    T extends CommercialCatalogModel = CommercialCatalogModel,
> extends CatalogService<T> {
    async hybridSearch({
        user,
        projectUuid,
        ...rest
    }: {
        user: SessionUser;
        projectUuid: string;
        embedQueries: number[][];
        exploreName?: string;
        type?: CatalogType;
        limit?: number;
    }): Promise<KnexPaginatedData<(CatalogTable | CatalogField)[]>> {
        const { organizationUuid } = await this.projectModel.getSummary(
            projectUuid,
        );
        if (
            user.ability.cannot(
                'view',
                subject('Project', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError();
        }

        const tablesConfiguration =
            await this.projectModel.getTablesConfiguration(projectUuid);

        const userAttributes =
            await this.userAttributesModel.getAttributeValuesForOrgMember({
                organizationUuid,
                userUuid: user.userUuid,
            });

        return this.catalogModel.hybridSearch({
            projectUuid,
            tablesConfiguration,
            userAttributes,
            ...rest,
        });
    }
}
