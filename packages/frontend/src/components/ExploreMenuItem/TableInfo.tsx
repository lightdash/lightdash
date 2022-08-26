import { FC } from 'react';
import { LineageButton } from '../LineageButton';

interface TableInfoProps {
    tableName: string;
    schemaName: string;
    databaseName: string;
    description?: string;
}

const TableInfo: FC<TableInfoProps> = ({
    tableName,
    schemaName,
    databaseName,
    description,
}) => {
    return (
        <>
            <p>
                <b>Table</b>: {tableName}
            </p>

            <p>
                <b>Schema</b>: {schemaName}
            </p>

            <p>
                <b>Database</b>: {databaseName}
            </p>

            {description && (
                <p>
                    <b>Description</b>: {description}
                </p>
            )}

            <LineageButton />
        </>
    );
};

export default TableInfo;
