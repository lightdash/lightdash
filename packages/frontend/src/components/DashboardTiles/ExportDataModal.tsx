import { Button, Group } from '@mantine/core';
import { IconTableExport } from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import MantineModal from '../common/MantineModal';
import ExportResults, { type ExportResultsProps } from '../ExportResults';

interface ExportDataModalProps extends ExportResultsProps {
    isOpen: boolean;
    onClose: () => void;
}

const ExportDataModal: FC<ExportDataModalProps> = ({
    isOpen,
    onClose,
    ...exportResultsProps
}) => {
    const { t } = useTranslation('dashboard');
    if (!isOpen) return null;

    return (
        <MantineModal
            opened
            onClose={onClose}
            title={t('tile.exportData')}
            icon={IconTableExport}
            size="md"
            cancelLabel={false}
        >
            <ExportResults
                {...exportResultsProps}
                renderDialogActions={({ onExport, isExporting }) => (
                    <Group justify="flex-end" gap="xs">
                        <Button variant="default" onClick={onClose}>
                            {t('actions.cancel', { ns: 'common' })}
                        </Button>

                        <Button
                            loading={isExporting}
                            onClick={async () => {
                                await onExport();
                            }}
                            data-testid="chart-export-results-button"
                        >
                            {t('actions.download', { ns: 'common' })}
                        </Button>
                    </Group>
                )}
            />
        </MantineModal>
    );
};

export default ExportDataModal;
