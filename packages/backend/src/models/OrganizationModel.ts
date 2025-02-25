import {
    CreateColorPalette,
    CreateOrganization,
    NotFoundError,
    Organization,
    OrganizationColorPalette,
    UpdateColorPalette,
    UpdateOrganization,
    UserAllowedOrganization,
} from '@lightdash/common';
import { Knex } from 'knex';
import {
    DbOrganizationColorPalette,
    OrganizationColorPaletteTableName,
} from '../database/entities/organizationColorPalettes';
import { OrganizationMembershipsTableName } from '../database/entities/organizationMemberships';
import {
    DbOrganization,
    OrganizationTableName,
} from '../database/entities/organizations';
import { OrganizationAllowedEmailDomainsTableName } from '../database/entities/organizationsAllowedEmailDomains';

export class OrganizationModel {
    private database: Knex;

    constructor(database: Knex) {
        this.database = database;
    }

    static mapDBObjectToOrganization(
        data: DbOrganization,
        palette?: DbOrganizationColorPalette,
    ): Organization {
        return {
            organizationUuid: data.organization_uuid,
            name: data.organization_name,
            chartColors: palette?.colors ?? undefined,
            defaultProjectUuid: data.default_project_uuid
                ? data.default_project_uuid
                : undefined,
        };
    }

    async hasOrgs(): Promise<boolean> {
        const orgs = await this.database(OrganizationTableName).select(
            'organization_id',
        );
        return orgs.length > 0;
    }

    async get(organizationUuid: string): Promise<Organization> {
        const [org] = await this.database(OrganizationTableName)
            .where('organization_uuid', organizationUuid)
            .select('*');

        if (org === undefined) {
            throw new NotFoundError(`No organization found`);
        }

        const [palette] = await this.database(OrganizationColorPaletteTableName)
            .where('color_palette_uuid', org.color_palette_uuid)
            .andWhere('organization_uuid', organizationUuid)
            .andWhere('is_default', true)
            .select('*');

        return OrganizationModel.mapDBObjectToOrganization(org, palette);
    }

    async create(data: CreateOrganization): Promise<Organization> {
        const [org] = await this.database(OrganizationTableName)
            .insert({
                organization_name: data.name,
            })
            .returning('*');
        return OrganizationModel.mapDBObjectToOrganization(org);
    }

    async update(
        organizationUuid: string,
        data: UpdateOrganization,
    ): Promise<Organization> {
        // Undefined values are ignored by .update (it DOES NOT set null)
        const updateData: {
            organization_name?: string;
            default_project_uuid?: string | null;
            color_palette_uuid?: string | null;
        } = {
            organization_name: data.name,
            default_project_uuid: data.defaultProjectUuid,
        };

        if (data.colorPaletteUuid !== undefined) {
            updateData.color_palette_uuid = data.colorPaletteUuid;
        }

        const [org] = await this.database(OrganizationTableName)
            .where('organization_uuid', organizationUuid)
            .update(updateData)
            .returning('*');

        return OrganizationModel.mapDBObjectToOrganization(org);
    }

    async deleteOrgAndUsers(
        organizationUuid: string,
        userUuids: string[],
    ): Promise<void> {
        const [org] = await this.database(OrganizationTableName)
            .where('organization_uuid', organizationUuid)
            .select('*');
        if (org === undefined) {
            throw new NotFoundError(`No organization found`);
        }

        await this.database.transaction(async (trx) => {
            await trx('users').delete().whereIn('user_uuid', userUuids);

            await trx(OrganizationTableName)
                .where('organization_uuid', organizationUuid)
                .delete();
        });
    }

    async getAllowedOrgsForDomain(
        domain: string,
    ): Promise<UserAllowedOrganization[]> {
        const rows = await this.database(
            OrganizationAllowedEmailDomainsTableName,
        )
            .whereRaw('? = ANY(email_domains)', domain)
            .select('organization_uuid');

        if (rows.length === 0) {
            return [];
        }

        const membersCountSubQuery = this.database(
            OrganizationMembershipsTableName,
        )
            .count('user_id')
            .where(
                'organization_id',
                this.database.ref(`${OrganizationTableName}.organization_id`),
            );

        const allowedOrgs = await this.database(OrganizationTableName)
            .select('organization_uuid', 'organization_name', {
                members_count: membersCountSubQuery,
            })
            .whereIn(
                'organization_uuid',
                rows.map((r) => r.organization_uuid),
            );

        return allowedOrgs.map((o) => ({
            organizationUuid: o.organization_uuid,
            name: o.organization_name,
            membersCount: o.members_count,
        }));
    }

    async createColorPalette(
        organizationUuid: string,
        data: CreateColorPalette,
    ): Promise<OrganizationColorPalette> {
        const [palette] = await this.database(OrganizationColorPaletteTableName)
            .insert({
                organization_uuid: organizationUuid,
                name: data.name,
                colors: data.colors,
                is_default: false,
            })
            .returning('*');

        return OrganizationModel.mapDBColorPalette(palette);
    }

    async getColorPalettes(
        organizationUuid: string,
    ): Promise<OrganizationColorPalette[]> {
        const palettes = await this.database(OrganizationColorPaletteTableName)
            .where('organization_uuid', organizationUuid)
            .select('*');

        return palettes.map(OrganizationModel.mapDBColorPalette);
    }

    async updateColorPalette(
        colorPaletteUuid: string,
        data: UpdateColorPalette,
    ): Promise<OrganizationColorPalette> {
        const [palette] = await this.database(OrganizationColorPaletteTableName)
            .where('color_palette_uuid', colorPaletteUuid)
            .update({
                name: data.name,
                colors: data.colors,
            })
            .returning('*');

        return OrganizationModel.mapDBColorPalette(palette);
    }

    async deleteColorPalette(
        organizationUuid: string,
        colorPaletteUuid: string,
    ): Promise<void> {
        await this.database.transaction(async (trx) => {
            // Check if any organization is using this palette
            const orgsUsing = await trx(OrganizationTableName)
                .where('color_palette_uuid', colorPaletteUuid)
                .select('organization_uuid');

            if (orgsUsing.length > 0) {
                throw new Error(
                    'Cannot delete palette currently in use by organizations',
                );
            }

            await trx('organization_color_palettes')
                .where('color_palette_uuid', colorPaletteUuid)
                .andWhere('organization_uuid', organizationUuid)
                .delete();
        });
    }

    async setDefaultColorPalette(
        organizationUuid: string,
        colorPaletteUuid: string,
    ): Promise<OrganizationColorPalette> {
        return this.database.transaction(async (trx) => {
            // Clear existing default
            await trx('organization_color_palettes')
                .where('organization_uuid', organizationUuid)
                .andWhere('is_default', true)
                .update({ is_default: false });

            // Set new default
            const [palette] = await trx('organization_color_palettes')
                .where('color_palette_uuid', colorPaletteUuid)
                .andWhere('organization_uuid', organizationUuid)
                .update({ is_default: true })
                .returning('*');

            // Update organization reference
            await trx(OrganizationTableName)
                .where('organization_uuid', organizationUuid)
                .update({ color_palette_uuid: colorPaletteUuid });

            return OrganizationModel.mapDBColorPalette(palette);
        });
    }

    private static mapDBColorPalette(
        palette: DbOrganizationColorPalette,
    ): OrganizationColorPalette {
        return {
            colorPaletteUuid: palette.color_palette_uuid,
            organizationUuid: palette.organization_uuid,
            name: palette.name,
            colors: palette.colors,
            created_at: palette.created_at,
            isDefault: palette.is_default,
        };
    }
}
