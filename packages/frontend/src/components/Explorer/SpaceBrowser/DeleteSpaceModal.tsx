import { Button, Classes, Dialog } from '@blueprintjs/core';
import React, { FC, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useDeleteMutation, useSpace } from '../../../hooks/useSpaces';

interface DeleteSpaceModalProps {
    onClose?: () => void;
    spaceUuid: string;
}

export const DeleteSpaceModal: FC<DeleteSpaceModalProps> = ({
    onClose,
    spaceUuid,
}) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();

    const { data, isLoading } = useSpace(projectUuid, spaceUuid);
    const { mutate: deleteMutation, isLoading: isDeleting } =
        useDeleteMutation(projectUuid);
    const [name, setName] = useState<string>('');

    return (
        <Dialog
            isOpen={true}
            icon="folder-open"
            onClose={onClose}
            title="Delete space"
            lazy
            canOutsideClickClose={false}
        >
            <div className={Classes.DIALOG_BODY}>
                <p>
                    Are you sure you want to delete this space{' '}
                    <b>{data?.name}</b>?
                </p>
            </div>
            <div className={Classes.DIALOG_FOOTER}>
                <div className={Classes.DIALOG_FOOTER_ACTIONS}>
                    <Button
                        disabled={isDeleting}
                        onClick={() => onClose && onClose()}
                    >
                        Cancel
                    </Button>
                    <Button
                        disabled={isDeleting}
                        intent="danger"
                        onClick={() => {
                            deleteMutation(spaceUuid);
                            if (onClose) onClose();
                        }}
                    >
                        Delete
                    </Button>
                </div>
            </div>
        </Dialog>
    );
};
