import {
    Button,
    Dialog,
    DialogBody,
    DialogFooter,
    DialogProps,
} from '@blueprintjs/core';
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
        <Dialog lazy title="Exportpdate CSV" icon="control" {...modalProps}>
            <DialogBody>
                <ExportCSV rows={rows} getCsvLink={getCsvLink} />
            </DialogBody>

            <DialogFooter
                actions={
                    <>
                        <Button onClick={modalProps.onClose}>Cancel</Button>
                    </>
                }
            />
        </Dialog>
    );
};

export default ExportCSVModal;
