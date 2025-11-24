import { Button, Group, Modal, Text } from '@mantine/core';
import { IconTableExport } from '@tabler/icons-react';
import { type FC } from 'react';
import ExportResults, { type ExportResultsProps } from '../ExportResults';
import MantineIcon from '../common/MantineIcon';

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
        <Modal
            opened
            onClose={onClose}
            title={
                <Group spacing="xs">
                    <MantineIcon
                        icon={IconTableExport}
                        size="lg"
                        color="ldGray.7"
                    />
                    <Text fw={600}>Export Data</Text>
                </Group>
            }
            styles={(theme) => ({
                header: {
                    borderBottom: `1px solid ${theme.colors.ldGray[4]}`,
                },
                body: { padding: 0 },
            })}
        >
            <ExportResults
                {...exportResultsProps}
                renderDialogActions={({ onExport, isExporting }) => (
                    <Group
                        position="right"
                        sx={(theme) => ({
                            borderTop: `1px solid ${theme.colors.ldGray[4]}`,
                            bottom: 0,
                            padding: theme.spacing.md,
                        })}
                    >
                        <Button variant="outline" onClick={onClose}>
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
        </Modal>
    );
};

export default ExportDataModal;
