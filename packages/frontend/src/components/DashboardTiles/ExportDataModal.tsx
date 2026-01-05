import { Button, Group } from '@mantine-8/core';
import { IconTableExport } from '@tabler/icons-react';
import { type FC } from 'react';
import ExportResults, { type ExportResultsProps } from '../ExportResults';
import MantineModal from '../common/MantineModal';

interface ExportDataModalProps extends ExportResultsProps {
    isOpen: boolean;
    onClose: () => void;
}

const ExportDataModal: FC<ExportDataModalProps> = ({
    isOpen,
    onClose,
    ...exportResultsProps
}) => {
    if (!isOpen) return null;

    return (
        <MantineModal
            opened
            onClose={onClose}
            title="Export Data"
            icon={IconTableExport}
            cancelLabel={false}
        >
            <ExportResults
                {...exportResultsProps}
                renderDialogActions={({ onExport, isExporting }) => (
                    <Group justify="flex-end" mt="md">
                        <Button variant="default" onClick={onClose}>
                            Cancel
                        </Button>

                        <Button
                            loading={isExporting}
                            onClick={async () => {
                                await onExport();
                            }}
                            data-testid="chart-export-results-button"
                        >
                            Download
                        </Button>
                    </Group>
                )}
            />
        </MantineModal>
    );
};

export default ExportDataModal;
