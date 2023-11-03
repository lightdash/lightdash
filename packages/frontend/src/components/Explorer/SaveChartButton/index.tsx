import { Button } from '@mantine/core';
import { IconDeviceFloppy } from '@tabler/icons-react';
import { FC, useState } from 'react';
import { useAddVersionMutation } from '../../../hooks/useSavedQuery';
import useSearchParams from '../../../hooks/useSearchParams';
import { useExplorerContext } from '../../../providers/ExplorerProvider';
import MantineIcon from '../../common/MantineIcon';
import ChartCreateModal from '../../common/modal/ChartCreateModal';

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
    const spaceUuid = useSearchParams('fromSpace');

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
    const isDisabled = !unsavedChartVersion.tableName || !hasUnsavedChanges;

    return (
        <>
            <Button
                disabled={isDisabled}
                variant={isExplorer ? 'default' : undefined}
                color={isExplorer ? 'blue' : 'green'}
                size="xs"
                leftIcon={
                    isExplorer ? (
                        <MantineIcon icon={IconDeviceFloppy} />
                    ) : undefined
                }
                onClick={
                    savedChart
                        ? handleSavedQueryUpdate
                        : () => setIsQueryModalOpen(true)
                }
            >
                {savedChart ? 'Save changes' : 'Save chart'}
            </Button>

            {unsavedChartVersion && (
                <ChartCreateModal
                    isOpen={isQueryModalOpen}
                    savedData={unsavedChartVersion}
                    onClose={() => setIsQueryModalOpen(false)}
                    onConfirm={() => setIsQueryModalOpen(false)}
                    defaultSpaceUuid={spaceUuid ?? undefined}
                />
            )}
        </>
    );
};

export default SaveChartButton;
