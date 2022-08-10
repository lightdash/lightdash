import { Dialog } from '@blueprintjs/core';
import React, { FC } from 'react';
import { useUnderlyingDataContext } from './UnderlyingDataProvider';
import UnderlyingDataResultsTable from './UnderlyingDataResultsTable';

interface Props {}

const UnderlyingDataModal: FC<Props> = ({}) => {
    const { resultsData, fieldsMap, closeModal } = useUnderlyingDataContext();

    return (
        <Dialog
            isOpen={resultsData !== undefined}
            onClose={closeModal}
            lazy
            title={`View underlying data`}
            style={{
                // TODO class this

                width: '800px',
                height: '400px',
            }}
        >
            <UnderlyingDataResultsTable
                resultsData={resultsData}
                fieldsMap={fieldsMap}
            />
        </Dialog>
    );
};

export default UnderlyingDataModal;
