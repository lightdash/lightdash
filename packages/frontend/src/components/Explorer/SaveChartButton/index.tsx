import React, { FC, useState } from 'react';
import { useHistory, useParams } from 'react-router-dom';
import { useAddVersionMutation } from '../../../hooks/useSavedQuery';
import useSearchParams from '../../../hooks/useSearchParams';
import { useExplorerContext } from '../../../providers/ExplorerProvider';
import CreateSavedQueryModal from '../../SavedQueries/CreateSavedQueryModal';
import { SaveButton } from './SaveChartButton.styles';

const SaveChartButton: FC<{ isExplorer?: boolean }> = ({ isExplorer }) => {
    const unsavedChartVersion = useExplorerContext(
        (context) => context.state.unsavedChartVersion,
    );
    const hasUnsavedChanges = useExplorerContext(
        (context) => context.state.hasUnsavedChanges,
    );
    const savedChart = useExplorerContext(
        (context) => context.state.savedChart,
    );

    const [isQueryModalOpen, setIsQueryModalOpen] = useState<boolean>(false);

    const update = useAddVersionMutation();
    const handleSavedQueryUpdate = () => {
        if (savedChart?.uuid && unsavedChartVersion) {
            update.mutate({
                uuid: savedChart.uuid,
                payload: unsavedChartVersion,
            });
        }
    };
    return (
        <>
            <SaveButton
                $isLargeButton={isExplorer}
                icon={isExplorer ? 'saved' : undefined}
                intent={isExplorer ? 'none' : 'success'}
                text={savedChart ? 'Save changes' : 'Save chart'}
                disabled={!unsavedChartVersion.tableName || !hasUnsavedChanges}
                onClick={
                    savedChart
                        ? handleSavedQueryUpdate
                        : () => setIsQueryModalOpen(true)
                }
            />
            {unsavedChartVersion && (
                <CreateSavedQueryModal
                    isOpen={isQueryModalOpen}
                    savedData={unsavedChartVersion}
                    onClose={() => setIsQueryModalOpen(false)}
                />
            )}
        </>
    );
};

export default SaveChartButton;
