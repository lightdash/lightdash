import { Knex } from 'knex';

// TODO remove, not used
export type DbTheme = {
    theme_id: number;
    organization_uiid: string;
    created_at: Date;
    colours: string[];
};

export type DbThemeIn = Pick<DbTheme, 'organization_uiid' | 'colours'>;
export type DbThemeRemove = Pick<DbTheme, 'theme_id'>;

export type ThemeTable = Knex.CompositeTableType<DbTheme, DbThemeIn>;

export const ThemeTableName = 'themes';

export const createTheme = async (db: Knex, themeIn: DbThemeIn) => {
    await db<DbTheme>(ThemeTableName).insert<DbThemeIn>(themeIn);
};

export const deleteTheme = async (db: Knex, themeRemove: DbThemeRemove) => {
    await db<DbTheme>(ThemeTableName).where(themeRemove).delete();
};
