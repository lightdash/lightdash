import { Dialog } from '@blueprintjs/core';
import { getResultValues } from '@lightdash/common';
import React, { FC } from 'react';
import DownloadCsvButton from '../DownloadCsvButton';
import { HeaderRightContent } from './UnderlyingDataModal.styles';
import { useUnderlyingDataContext } from './UnderlyingDataProvider';
import UnderlyingDataResultsTable from './UnderlyingDataResultsTable';

interface Props {}

const UnderlyingDataModal: FC<Props> = ({}) => {
    const { resultsData, fieldsMap, closeModal, tableName } =
        useUnderlyingDataContext();

    return (
        <Dialog
            isOpen={resultsData !== undefined}
            onClose={closeModal}
            lazy
            title={`View underlying data`}
            style={{
                width: '800px',
                height: '600px',
            }}
        >
            <HeaderRightContent>
                <DownloadCsvButton
                    fileName={tableName}
                    rows={resultsData && getResultValues(resultsData.rows)}
                />
            </HeaderRightContent>
            <UnderlyingDataResultsTable
                resultsData={resultsData}
                fieldsMap={fieldsMap}
            />
        </Dialog>
    );
};

export default UnderlyingDataModal;
