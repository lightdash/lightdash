import { Button, Classes, Dialog, InputGroup, Intent } from '@blueprintjs/core';
import React, { FC, useState } from 'react';
import { useUpdateMutation } from '../../../hooks/useSpaces';
import { FormGroupWrapper } from './CreateSpaceModal.styles';

interface EditSpaceModalProps {
    isOpen: boolean;
    onClose?: () => void;
    currentName: string;
    spaceUuid: string;
}

export const EditSpaceModal: FC<EditSpaceModalProps> = ({
    isOpen,
    onClose,
    currentName,
    spaceUuid,
}) => {
    const { mutate, isLoading: isCreating } = useUpdateMutation(spaceUuid);
    const [name, setName] = useState<string>(currentName);

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
