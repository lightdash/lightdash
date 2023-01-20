import { SummaryExplore } from '@lightdash/common';
import { FC } from 'react';
import BlueprintParagraph from '../common/BlueprintParagraph';
import Lineage from './Lineage';

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
            <BlueprintParagraph>
                <b>Table</b>: {name}
            </BlueprintParagraph>

            {schemaName && (
                <BlueprintParagraph>
                    <b>Schema</b>: {schemaName}
                </BlueprintParagraph>
            )}

            {databaseName && (
                <BlueprintParagraph>
                    <b>Database</b>: {databaseName}
                </BlueprintParagraph>
            )}

            {description && (
                <BlueprintParagraph>
                    <b>Description</b>: {description}
                </BlueprintParagraph>
            )}

            <Lineage tableName={name} />
        </>
    );
};

export default TableInfo;
