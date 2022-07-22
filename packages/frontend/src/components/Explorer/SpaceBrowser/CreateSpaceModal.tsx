import { Button, Classes, Dialog, InputGroup, Intent } from '@blueprintjs/core';
import React, { FC, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useCreateMutation } from '../../../hooks/useSpaces';
import { FormGroupWrapper } from './CreateSpaceModal.styles';

interface CreateSpaceModalProps {
    isOpen: boolean;
    onClose?: () => void;
}

export const CreateSpaceModal: FC<CreateSpaceModalProps> = ({
    isOpen,
    onClose,
}) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();

    const { mutate, isLoading: isCreating } = useCreateMutation(projectUuid);
    const [name, setName] = useState<string>('');

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
                                if (onClose) onClose();
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
