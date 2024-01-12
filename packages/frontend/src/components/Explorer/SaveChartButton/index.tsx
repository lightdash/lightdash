import { ChartType } from '@lightdash/common';
import { Button } from '@mantine/core';
import { IconDeviceFloppy } from '@tabler/icons-react';
import { FC, useState } from 'react';
import useToaster from '../../../hooks/toaster/useToaster';
import { useAddVersionMutation } from '../../../hooks/useSavedQuery';
import useSearchParams from '../../../hooks/useSearchParams';
import { useExplorerContext } from '../../../providers/ExplorerProvider';
import MantineIcon from '../../common/MantineIcon';
import ChartCreateModal from '../../common/modal/ChartCreateModal';

const SaveChartButton: FC<{ isExplorer?: boolean }> = ({ isExplorer }) => {
    const { showToastError } = useToaster();

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

    const handleSaveChart = () => {
        const chartType =
            savedChart?.chartConfig.type ??
            unsavedChartVersion?.chartConfig.type;

        if (chartType === ChartType.CUSTOM) {
            showToastError({
                title: 'Saving custom charts is not supported yet!',
                subtitle: 'We are looking forward to hear your feedback',
                autoClose: 5000,
            });
            return;
        }

        return savedChart
            ? handleSavedQueryUpdate()
            : setIsQueryModalOpen(true);
    };

    return (
        <>
            <Button
                disabled={isDisabled}
                variant={isExplorer ? 'default' : undefined}
                color={isExplorer ? 'blue' : 'green.7'}
                size="xs"
                leftIcon={
                    isExplorer ? (
                        <MantineIcon icon={IconDeviceFloppy} />
                    ) : undefined
                }
                onClick={handleSaveChart}
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
