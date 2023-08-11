import { Button, Classes, Dialog } from '@blueprintjs/core';
import { TableCalculation } from '@lightdash/common';
import React, { FC } from 'react';
import { useExplorerContext } from '../../providers/ExplorerProvider';
import { useTracking } from '../../providers/TrackingProvider';
import { EventName } from '../../types/Events';

interface DeleteTableCalculationModalProps {
    isOpen: boolean;
    tableCalculation: TableCalculation;
    onClose: () => void;
}

const DeleteTableCalculationModal: FC<DeleteTableCalculationModalProps> = ({
    isOpen,
    tableCalculation,
    onClose,
}) => {
    const deleteTableCalculation = useExplorerContext(
        (context) => context.actions.deleteTableCalculation,
    );
    const { track } = useTracking();

    const onConfirm = () => {
        deleteTableCalculation(tableCalculation.name);
        track({
            name: EventName.CONFIRM_DELETE_TABLE_CALCULATION_BUTTON_CLICKED,
        });
        onClose();
    };
    return (
        <Dialog
            isOpen={isOpen}
            icon="cog"
            onClose={onClose}
            title="Settings"
            lazy
        >
            <div className={Classes.DIALOG_BODY}>
                <p>Are you sure you want to delete this table calculation ?</p>
            </div>
            <div className={Classes.DIALOG_FOOTER}>
                <div className={Classes.DIALOG_FOOTER_ACTIONS}>
                    <Button onClick={onClose}>Cancel</Button>
                    <Button intent="danger" onClick={onConfirm}>
                        Delete
                    </Button>
                </div>
            </div>
        </Dialog>
    );
};

export default DeleteTableCalculationModal;
