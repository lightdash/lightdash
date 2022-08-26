import { SummaryExplore } from '@lightdash/common';
import { FC } from 'react';
import { LineageButton } from '../LineageButton';

type TableInfoProps = Pick<
    SummaryExplore,
    'name' | 'databaseName' | 'schemaName' | 'description'
>;

const TableInfo: FC<TableInfoProps> = ({
    name,
    schemaName,
    databaseName,
    description,
}) => {
    return (
        <>
            <p>
                <b>Table</b>: {name}
            </p>

            {schemaName && (
                <p>
                    <b>Schema</b>: {schemaName}
                </p>
            )}

            {databaseName && (
                <p>
                    <b>Database</b>: {databaseName}
                </p>
            )}

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
