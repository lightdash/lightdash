import { Theme } from 'common';
import { Knex } from 'knex';
import { NotFoundError } from '../errors';

export class ThemeModel {
    readonly database: Knex;

    constructor({ database }: { database: Knex }) {
        this.database = database;
    }

    async createTheme(organizationUuid: string, colours: string[]) {
        await this.database('themes').insert({
            colours,
            organization_uuid: organizationUuid,
        });
    }

    async getThemeByOrganizationId(organizationUuid: string): Promise<Theme> {
        const [theme] = await this.database('themes')
            .where('organization_uuid', organizationUuid)
            .select('*');
        if (theme === undefined) {
            throw new NotFoundError(
                `Cannot find theme with oganization_id ${organizationUuid}`,
            );
        }
        return {
            themeId: theme.theme_id,
            colours: theme.colours,
            organizationUuid: theme.organization_uiid,
            createdAt: theme.created_at,
        };
    }
}
