import { WarehouseTypes } from '@lightdash/common';
import { useLocalStorage } from '@mantine/hooks';

export type SqlEditorPreferences = {
    quotePreference: 'always' | 'never';
    casePreference: 'lowercase' | 'uppercase';
};

/**
 * Returns the SQL editor preferences for the given warehouse type.
 *
 * Currently, only Snowflake is supported.
 *
 * @param warehouseType - The warehouse type to get the preferences for.
 * @returns The SQL editor preferences.
 */
export const useSqlEditorPreferences = (
    warehouseType?: WarehouseTypes,
): [
    SqlEditorPreferences | undefined,
    (settings: SqlEditorPreferences) => void,
] => {
    const getDefaultPreferences = (
        warehouse?: WarehouseTypes,
    ): SqlEditorPreferences | undefined => {
        if (warehouse === WarehouseTypes.SNOWFLAKE) {
            return {
                quotePreference: 'always',
                casePreference: 'uppercase',
            };
        }
        return undefined;
    };

    const [settings, setSettings] = useLocalStorage<SqlEditorPreferences>({
        key: 'lightdash-sql-editor-preferences',
        defaultValue: getDefaultPreferences(warehouseType),
    });

    return [
        warehouseType === WarehouseTypes.SNOWFLAKE ? settings : undefined,
        setSettings,
    ];
};
