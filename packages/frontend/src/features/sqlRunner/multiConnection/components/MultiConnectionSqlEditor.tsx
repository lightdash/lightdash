import { type WarehouseTablesCatalog } from '@lightdash/common';
import { useMemo, type FC } from 'react';
import {
    SqlEditorView,
    type EditorTables,
    type SqlEditorProps,
} from '../../components/SqlEditor';
import { useDetectedTableFields } from '../../hooks/useDetectedTableFields';
import { useAppSelector } from '../../store/hooks';
import { useActiveConnection } from '../hooks/useActiveConnection';
import {
    useConnectionDatabases,
    useConnectionTableFields,
    useTableUnits,
} from '../hooks/useConnectionCatalog';
import { tableUnitId } from '../utils/warehouseTreeRows';

const toEditorTables = (
    database: string,
    catalog: WarehouseTablesCatalog | undefined,
): EditorTables | undefined => {
    const schemas = catalog?.[database];
    if (!schemas) return undefined;
    return {
        database,
        tablesBySchema: Object.entries(schemas).map(([schema, tables]) => ({
            schema,
            tables,
        })),
    };
};

export const MultiConnectionSqlEditor: FC<SqlEditorProps> = (props) => {
    const sql = useAppSelector((state) => state.sqlRunner.sql);
    const quoteChar = useAppSelector((state) => state.sqlRunner.quoteChar);
    const { projectUuid, activeConnectionUuid, activeTable } =
        useActiveConnection();

    const connectionIds = useMemo(
        () => (activeConnectionUuid ? [activeConnectionUuid] : []),
        [activeConnectionUuid],
    );
    const enabledConnectionIds = useMemo(
        () => new Set(connectionIds),
        [connectionIds],
    );
    const databases = useConnectionDatabases({
        projectUuid,
        connectionIds,
        enabledConnectionIds,
    });
    const listing = activeConnectionUuid
        ? databases.listings.get(activeConnectionUuid)
        : undefined;
    const database = (
        listing?.databases.find((candidate) => candidate.isDefault) ??
        listing?.databases[0]
    )?.database;

    const units = useMemo(
        () =>
            activeConnectionUuid && database
                ? [
                      {
                          connectionId: activeConnectionUuid,
                          warehouseConnectionUuid: activeConnectionUuid,
                          database,
                      },
                  ]
                : [],
        [activeConnectionUuid, database],
    );
    const enabledUnitIds = useMemo(
        () => new Set(units.map(tableUnitId)),
        [units],
    );
    const tableUnits = useTableUnits({ projectUuid, units, enabledUnitIds });
    const unitState = units[0]
        ? tableUnits.states.get(tableUnitId(units[0]))
        : undefined;

    const transformedData = useMemo(
        () =>
            database && unitState?.status === 'loaded'
                ? toEditorTables(database, unitState.catalog)
                : undefined,
        [database, unitState],
    );

    const currentTableIdentity =
        activeTable && activeTable.connectionId === activeConnectionUuid
            ? activeTable
            : undefined;
    const { data: currentTableSchema } = useConnectionTableFields({
        projectUuid,
        identity: currentTableIdentity,
    });
    const tableFieldsData = useMemo(
        () =>
            currentTableSchema
                ? Object.entries(currentTableSchema).map(([name, type]) => ({
                      name,
                      type,
                  }))
                : undefined,
        [currentTableSchema],
    );

    const { data: detectedTablesFieldData } = useDetectedTableFields({
        sql,
        quoteChar,
        projectUuid,
        transformedData,
        connectionId: activeConnectionUuid,
    });

    return (
        <SqlEditorView
            {...props}
            catalog={{
                transformedData,
                isTablesDataLoading: false,
                tableFieldsData,
                detectedTablesFieldData,
                currentTable: currentTableIdentity?.table,
                currentSchema: currentTableIdentity?.schema,
            }}
        />
    );
};
