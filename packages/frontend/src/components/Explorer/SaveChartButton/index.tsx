import { FC, useState } from 'react';
import { useAddVersionMutation } from '../../../hooks/useSavedQuery';
import { useExplorer } from '../../../providers/ExplorerProvider';
import CreateSavedQueryModal from '../../SavedQueries/CreateSavedQueryModal';
import { SaveButton } from './SaveChartButton.styles';

const SaveChartButton: FC<{ isExplorer?: boolean }> = ({ isExplorer }) => {
    const {
        state: { unsavedChartVersion, hasUnsavedChanges, savedChart },
    } = useExplorer();

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
