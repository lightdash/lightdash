import { Button, Group, Modal, Text, type ModalProps } from '@mantine/core';
import { IconTableExport } from '@tabler/icons-react';
import { type FC } from 'react';
import ExportCSV, { type ExportCSVProps } from '.';
import MantineIcon from '../common/MantineIcon';

type ExportCSVModalProps = ModalProps &
    ExportCSVProps & {
        onConfirm?: () => void;
    };

const ExportCSVModal: FC<ExportCSVModalProps> = ({
    projectUuid,
    onConfirm,
    rows,
    getCsvLink,
    ...modalProps
}) => {
    return (
        <Modal
            title={
                <Group spacing="xs">
                    <MantineIcon
                        icon={IconTableExport}
                        size="lg"
                        color="gray.7"
                    />
                    <Text fw={600}>Export CSV</Text>
                </Group>
            }
            styles={(theme) => ({
                header: { borderBottom: `1px solid ${theme.colors.gray[4]}` },
                body: { padding: 0 },
            })}
            {...modalProps}
        >
            <ExportCSV
                projectUuid={projectUuid}
                rows={rows}
                getCsvLink={getCsvLink}
                isDialogBody
                renderDialogActions={({ onExport, isExporting }) => (
                    <Group
                        position="right"
                        sx={(theme) => ({
                            borderTop: `1px solid ${theme.colors.gray[4]}`,
                            bottom: 0,
                            padding: theme.spacing.md,
                        })}
                    >
                        <Button variant="outline" onClick={modalProps.onClose}>
                            Cancel
                        </Button>

                        <Button
                            loading={isExporting}
                            onClick={async () => {
                                await onExport();
                                onConfirm?.();
                            }}
                        >
                            Export CSV
                        </Button>
                    </Group>
                )}
            />
        </Modal>
    );
};

export default ExportCSVModal;
