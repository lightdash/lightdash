import { Button, Classes, Dialog, InputGroup, Intent } from '@blueprintjs/core';
import { Space } from '@lightdash/common';
import React, { FC, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useCreateMutation } from '../../../hooks/useSpaces';
import { FormGroupWrapper } from './CreateSpaceModal.styles';

interface CreateSpaceModalProps {
    isOpen: boolean;
    onClose?: () => void;
    onCreated?: (data: Space) => void;
}

export const CreateSpaceModal: FC<CreateSpaceModalProps> = ({
    isOpen,
    onClose,
    onCreated,
}) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();

    const {
        mutate,
        isLoading: isCreating,
        isSuccess: isCreated,
        data: newSpace,
    } = useCreateMutation(projectUuid);
    const [name, setName] = useState<string>('');

    useEffect(() => {
        if (onCreated && newSpace) onCreated(newSpace);
    }, [onCreated, isCreated, newSpace]);
    return (
        <Dialog isOpen={isOpen} onClose={onClose} lazy title="Create space">
            <form>
                <div className={Classes.DIALOG_BODY}>
                    <FormGroupWrapper
                        label="Enter a memorable name for your space"
                        labelFor="space-name"
                    >
                        <InputGroup
                            id="space-name"
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="eg. KPIs"
                        />
                    </FormGroupWrapper>
                </div>
                <div className={Classes.DIALOG_FOOTER}>
                    <div className={Classes.DIALOG_FOOTER_ACTIONS}>
                        <Button onClick={onClose}>Cancel</Button>
                        <Button
                            data-cy="submit-base-modal"
                            intent={Intent.SUCCESS}
                            text="Create"
                            type="submit"
                            onClick={(e) => {
                                mutate({ name });
                                setName('');
                                if (onClose && !onCreated) onClose();
                                e.preventDefault();
                            }}
                            disabled={isCreating || !name}
                        />
                    </div>
                </div>
            </form>
        </Dialog>
    );
};
