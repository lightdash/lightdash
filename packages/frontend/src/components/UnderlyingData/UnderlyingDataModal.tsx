import { AnchorButton, Dialog } from '@blueprintjs/core';
import { getResultValues } from '@lightdash/common';
import React, { FC } from 'react';
import DownloadCsvButton from '../DownloadCsvButton';
import { HeaderRightContent } from './UnderlyingDataModal.styles';
import { useUnderlyingDataContext } from './UnderlyingDataProvider';
import UnderlyingDataResultsTable from './UnderlyingDataResultsTable';

interface Props {}

const UnderlyingDataModal: FC<Props> = ({}) => {
    const {
        resultsData,
        fieldsMap,
        closeModal,
        tableName,
        exploreFromHereUrl,
        hasJoins,
    } = useUnderlyingDataContext();

    return (
        <Dialog
            isOpen={resultsData !== undefined}
            onClose={closeModal}
            lazy
            title={`View underlying data`}
            style={{
                width: '800px',
                maxHeight: '600px',
            }}
        >
            <HeaderRightContent>
                <DownloadCsvButton
                    fileName={tableName}
                    rows={resultsData && getResultValues(resultsData.rows)}
                />
                <AnchorButton
                    intent="primary"
                    href={exploreFromHereUrl}
                    icon="series-search"
                    target="_blank"
                >
                    Explore from here
                </AnchorButton>
            </HeaderRightContent>
            <UnderlyingDataResultsTable
                resultsData={resultsData}
                fieldsMap={fieldsMap}
                hasJoins={hasJoins}
            />
        </Dialog>
    );
};

export default UnderlyingDataModal;
