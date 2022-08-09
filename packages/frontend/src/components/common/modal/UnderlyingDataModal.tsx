import { Dialog } from '@blueprintjs/core';
import { ApiQueryResults, Field } from '@lightdash/common';
import React, { FC } from 'react';
import { useSqlQueryMutation } from '../../../hooks/useSqlQuery';
import SqlRunnerResultsTable from '../../SqlRunner/SqlRunnerResultsTable';

interface Props {
    isOpen: boolean;
    onClose?: () => void;
    fieldsMap: Record<string, Field>;
    resultsData: ApiQueryResults | undefined;
    status: ReturnType<typeof useSqlQueryMutation>;
}

const UnderlyingDataModal: FC<Props> = ({
    isOpen,
    onClose,
    fieldsMap,
    resultsData,
    status,
}) => {
    return (
        <Dialog
            isOpen={isOpen}
            onClose={onClose}
            lazy
            title={`View underlying data`}
        >
            <SqlRunnerResultsTable
                onSubmit={() => {}}
                resultsData={resultsData}
                fieldsMap={fieldsMap}
                sqlQueryMutation={status}
            />
        </Dialog>
    );
};

export default UnderlyingDataModal;
