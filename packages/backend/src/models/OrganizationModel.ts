import {
    CreateColorPalette,
    CreateOrganization,
    NotFoundError,
    Organization,
    OrganizationColorPalette,
    OrganizationColorPaletteWithIsActive,
    ParameterError,
    UpdateColorPalette,
    UpdateOrganization,
    UserAllowedOrganization,
} from '@lightdash/common';
import { Knex } from 'knex';
import { LightdashConfig } from '../config/parseConfig';
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

export const PRESET_COLOR_PALETTES = [
    {
        name: 'Default',
        colors: [
            // Default ECharts colors plus additional colors
            '#5470c6',
            '#91cc75',
            '#fac858',
            '#ee6666',
            '#73c0de',
            '#3ba272',
            '#fc8452',
            '#9a60b4',
            '#ea7ccc',
            '#33ff7d',
            '#33ffb1',
            '#33ffe6',
            '#33e6ff',
            '#33b1ff',
            '#337dff',
            '#3349ff',
            '#5e33ff',
            '#9233ff',
            '#c633ff',
            '#ff33e1',
        ],
    },
    {
        name: 'Modern',
        colors: [
            '#7162FF',
            '#1A1B1E',
            '#2D2E30',
            '#4A4B4D',
            '#6B6C6E',
            '#E8DDFB',
            '#D4F7E9',
            '#F0A3FF',
            '#00FFEA',
            '#FFEA00',
            '#00FF7A',
            '#FF0080',
            '#FF6A00',
            '#6A00FF',
            '#00FF00',
            '#FF0000',
            '#FF00FF',
            '#00FFFF',
            '#7A00FF',
            '#FFAA00',
        ],
    },
    {
        name: 'Retro',
        colors: [
            '#FF6B35',
            '#ECB88A',
            '#D4A373',
            '#BC8A5F',
            '#A47148',
            '#8A5A39',
            '#6F4E37',
            '#544334',
            '#393731',
            '#2E2E2E',
            '#F4D06F',
            '#FFD700',
            '#C0BABC',
            '#A9A9A9',
            '#808080',
            '#696969',
            '#556B2F',
            '#6B8E23',
            '#8FBC8B',
            '#BDB76B',
        ],
    },
    {
        name: 'Business',
        colors: [
            '#1A237E',
            '#283593',
            '#303F9F',
            '#3949AB',
            '#3F51B5',
            '#5C6BC0',
            '#7986CB',
            '#9FA8DA',
            '#C5CAE9',
            '#E8EAF6',
            '#4CAF50',
            '#66BB6A',
            '#81C784',
            '#A5D6A7',
            '#C8E6C9',
            '#FFA726',
            '#FFB74D',
            '#FFCC80',
            '#FFE0B2',
            '#FFF3E0',
        ],
    },
    {
        name: 'Lightdash',
        colors: [
            '#7162FF',
            '#1A1B1E',
            '#E8DDFB',
            '#D4F7E9',
            '#F0A3FF',
            '#00FFEA',
            '#FFEA00',
            '#00FF7A',
            '#FF0080',
            '#FF6A00',
            '#6A00FF',
            '#00FF00',
            '#FF0000',
            '#FF00FF',
            '#00FFFF',
            '#7A00FF',
            '#FF7A00',
            '#00FFAA',
            '#FF00AA',
            '#FFAA00',
        ],
    },
    {
        name: 'Data Matrix',
        colors: [
            '#FF00FF',
            '#00FFFF',
            '#FFFF00',
            '#FF0080',
            '#00FF00',
            '#00FF80',
            '#8000FF',
            '#FF8000',
            '#FF0088',
            '#00FF88',
            '#0088FF',
            '#88FF00',
            '#FF8800',
            '#FF8800',
            '#FF0088',
            '#8800FF',
            '#0088FF',
            '#8800FF',
            '#00FF88',
            '#FF8800',
        ],
    },
];

export class OrganizationModel {
    private database: Knex;

    private lightdashConfig: LightdashConfig | undefined;

    constructor(database: Knex, lightdashConfig?: LightdashConfig) {
        this.database = database;
        this.lightdashConfig = lightdashConfig;
    }

    static mapDBObjectToOrganization(
        data: DbOrganization,
        palette?: DbOrganizationColorPalette['colors'],
        darkPalette?: DbOrganizationColorPalette['dark_colors'],
    ): Organization {
        return {
            organizationUuid: data.organization_uuid,
            name: data.organization_name,
            chartColors: palette ?? undefined,
            chartDarkColors: darkPalette ?? undefined,
            defaultProjectUuid: data.default_project_uuid
                ? data.default_project_uuid
                : undefined,
            createdAt: data.created_at,
        };
    }

    async hasOrgs(): Promise<boolean> {
        const orgs = await this.database(OrganizationTableName).select(
            'organization_id',
        );
        return orgs.length > 0;
    }

    async getOrgUuids(): Promise<string[]> {
        const orgs = await this.database(OrganizationTableName).select(
            'organization_uuid',
        );
        return orgs.map((org) => org.organization_uuid);
    }

    async get(organizationUuid: string): Promise<Organization> {
        const [org] = await this.database(OrganizationTableName)
            .where('organization_uuid', organizationUuid)
            .select('*');

        if (org === undefined) {
            throw new NotFoundError(`No organization found`);
        }

        // If override color palette is configured, always override the active palette
        if (
            this.lightdashConfig?.appearance?.overrideColorPalette &&
            this.lightdashConfig.appearance.overrideColorPalette.length > 0
        ) {
            return OrganizationModel.mapDBObjectToOrganization(
                org,
                this.lightdashConfig.appearance.overrideColorPalette,
                undefined,
            );
        }

        const palette = await this.database(OrganizationColorPaletteTableName)
            .where('color_palette_uuid', org.color_palette_uuid)
            .andWhere('organization_uuid', organizationUuid)
            .select('*')
            .first();

        return OrganizationModel.mapDBObjectToOrganization(
            org,
            palette?.colors,
            palette?.dark_colors,
        );
    }

    async create(data: CreateOrganization): Promise<Organization> {
        const [org] = await this.database(OrganizationTableName)
            .insert({
                organization_name: data.name,
            })
            .returning('*');
        // seed with default color palettes
        await this.database.batchInsert(
            OrganizationColorPaletteTableName,
            PRESET_COLOR_PALETTES.map((palette) => ({
                organization_uuid: org.organization_uuid,
                name: palette.name,
                colors: palette.colors,
            })),
        );

        return OrganizationModel.mapDBObjectToOrganization(
            org,
            undefined,
            undefined,
        );
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
            color_palette_uuid: data.colorPaletteUuid,
        };

        const [org] = await this.database(OrganizationTableName)
            .where('organization_uuid', organizationUuid)
            .update(updateData)
            .returning('*');

        if (org.color_palette_uuid) {
            const [palette] = await this.database(
                OrganizationColorPaletteTableName,
            )
                .where('color_palette_uuid', org.color_palette_uuid)
                .andWhere('organization_uuid', organizationUuid)
                .select('*');

            return OrganizationModel.mapDBObjectToOrganization(
                org,
                palette.colors,
                palette.dark_colors,
            );
        }

        return OrganizationModel.mapDBObjectToOrganization(
            org,
            undefined,
            undefined,
        );
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
                dark_colors: data.darkColors || null,
            })
            .returning('*');

        return OrganizationModel.mapDBColorPalette(palette);
    }

    async getColorPalettes(
        organizationUuid: string,
    ): Promise<OrganizationColorPaletteWithIsActive[]> {
        const palettes = await this.database(OrganizationColorPaletteTableName)
            .where('organization_uuid', organizationUuid)
            .select('*');

        const [organization] = await this.database(OrganizationTableName)
            .where('organization_uuid', organizationUuid)
            .select('*');

        return palettes.map((palette) =>
            OrganizationModel.mapDBColorPaletteWithIsActive(
                palette,
                organization,
            ),
        );
    }

    async updateColorPalette(
        organizationUuid: string,
        colorPaletteUuid: string,
        data: UpdateColorPalette,
    ): Promise<OrganizationColorPalette> {
        const [palette] = await this.database(OrganizationColorPaletteTableName)
            .where('color_palette_uuid', colorPaletteUuid)
            .andWhere('organization_uuid', organizationUuid)
            .update({
                name: data.name,
                colors: data.colors,
                dark_colors: data.darkColors,
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
                throw new ParameterError(
                    'Cannot delete palette currently in use by organizations',
                );
            }

            await trx('organization_color_palettes')
                .where('color_palette_uuid', colorPaletteUuid)
                .andWhere('organization_uuid', organizationUuid)
                .delete();
        });
    }

    async setActiveColorPalette(
        organizationUuid: string,
        colorPaletteUuid: string,
    ): Promise<OrganizationColorPalette> {
        return this.database.transaction(async (trx) => {
            // Set new active
            const [palette] = await trx('organization_color_palettes')
                .where('color_palette_uuid', colorPaletteUuid)
                .andWhere('organization_uuid', organizationUuid)
                .returning('*');

            if (!palette) {
                throw new NotFoundError(
                    `Color palette not found: ${colorPaletteUuid}`,
                );
            }

            // Update organization reference
            await trx(OrganizationTableName)
                .where('organization_uuid', organizationUuid)
                .update({ color_palette_uuid: palette.color_palette_uuid });

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
            darkColors: palette.dark_colors,
            createdAt: palette.created_at,
        };
    }

    private static mapDBColorPaletteWithIsActive(
        palette: DbOrganizationColorPalette,
        organization: DbOrganization,
    ): OrganizationColorPaletteWithIsActive {
        return {
            ...OrganizationModel.mapDBColorPalette(palette),
            isActive:
                palette.color_palette_uuid === organization.color_palette_uuid,
        };
    }
}
