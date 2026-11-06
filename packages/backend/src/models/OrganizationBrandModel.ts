import { NotFoundError, OrganizationBrand } from '@lightdash/common';
import { Knex } from 'knex';
import { OrganizationTableName } from '../database/entities/organizations';
import {
    DbOrganizationBrand,
    DbOrganizationBrandLogoFile,
    DbOrganizationBrandLogoFileIn,
    DbOrganizationBrandRow,
    OrganizationBrandLogoFilesTableName,
} from '../ee/database/entities/organizationBrand';

export class OrganizationBrandModel {
    constructor(private readonly database: Knex) {}

    private static mapDBBrand(
        organizationUuid: string,
        brand: DbOrganizationBrand,
    ): OrganizationBrand {
        return {
            organizationUuid,
            domain: brand.domain,
            name: brand.name,
            description: brand.description,
            logos: brand.logos,
            colors: brand.colors,
            fonts: brand.fonts,
            updatedAt: new Date(brand.updatedAt),
        };
    }

    async findBrand(
        organizationUuid: string,
    ): Promise<OrganizationBrand | undefined> {
        const row = await this.database<DbOrganizationBrandRow>(
            OrganizationTableName,
        )
            .where('organization_uuid', organizationUuid)
            .select('brand')
            .first();

        return row?.brand
            ? OrganizationBrandModel.mapDBBrand(organizationUuid, row.brand)
            : undefined;
    }

    async updateBrand(
        organizationUuid: string,
        brand: Omit<DbOrganizationBrand, 'updatedAt'>,
    ): Promise<OrganizationBrand> {
        const dbBrand: DbOrganizationBrand = {
            ...brand,
            updatedAt: new Date().toISOString(),
        };
        const [row] = await this.database<DbOrganizationBrandRow>(
            OrganizationTableName,
        )
            .where('organization_uuid', organizationUuid)
            .update({ brand: dbBrand })
            .returning('organization_uuid');

        if (row === undefined) {
            throw new NotFoundError(`No organization found`);
        }

        return OrganizationBrandModel.mapDBBrand(organizationUuid, dbBrand);
    }

    async createBrandLogoFile(
        logoFile: DbOrganizationBrandLogoFileIn,
    ): Promise<string> {
        const [row] = await this.database(OrganizationBrandLogoFilesTableName)
            .insert(logoFile)
            .returning('logo_file_uuid');
        return row.logo_file_uuid;
    }

    async findBrandLogoFile(
        organizationUuid: string,
        logoFileUuid: string,
    ): Promise<
        Pick<DbOrganizationBrandLogoFile, 'content_type' | 'data'> | undefined
    > {
        return this.database(OrganizationBrandLogoFilesTableName)
            .where('organization_uuid', organizationUuid)
            .andWhere('logo_file_uuid', logoFileUuid)
            .select('content_type', 'data')
            .first();
    }

    async deleteUnusedBrandLogoFiles(
        organizationUuid: string,
        usedLogoFileUuids: string[],
    ): Promise<number> {
        return this.database(OrganizationBrandLogoFilesTableName)
            .where('organization_uuid', organizationUuid)
            .whereNotIn('logo_file_uuid', usedLogoFileUuids)
            .delete();
    }
}
