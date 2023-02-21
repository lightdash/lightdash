import { Button, Dialog, DialogFooter, DialogProps } from '@blueprintjs/core';
import { FC } from 'react';
import ExportCSV, { ExportCSVProps } from '.';

type ExportCSVModalProps = DialogProps &
    ExportCSVProps & {
        onConfirm?: () => void;
    };

const ExportCSVModal: FC<ExportCSVModalProps> = ({
    onConfirm,
    rows,
    getCsvLink,
    ...modalProps
}) => {
    return (
        <Dialog lazy title="Export CSV" icon="control" {...modalProps}>
            <ExportCSV
                rows={rows}
                getCsvLink={getCsvLink}
                isDialogBody
                renderDialogActions={({ onExport, isExporting }) => (
                    <>
                        <Button onClick={modalProps.onClose}>Cancel</Button>

                        <Button
                            loading={isExporting}
                            onClick={() => {
                                onExport().then(() => {
                                    onConfirm?.();
                                });
                            }}
                            intent="primary"
                        >
                            Export CSV
                        </Button>
                    </>
                )}
            />
        </Dialog>
    );
};

export default ExportCSVModal;
