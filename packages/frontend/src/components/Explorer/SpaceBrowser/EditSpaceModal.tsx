import {
    Button,
    Classes,
    Dialog,
    InputGroup,
    Intent,
    Position,
} from '@blueprintjs/core';
import { Tooltip2 } from '@blueprintjs/popover2';
import React, { FC, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useSpace, useUpdateMutation } from '../../../hooks/useSpaces';
import { FormGroupWrapper } from './CreateSpaceModal.styles';

interface EditSpaceModalProps {
    onClose?: () => void;
    spaceUuid: string;
}

export const EditSpaceModal: FC<EditSpaceModalProps> = ({
    onClose,
    spaceUuid,
}) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();

    const { data, isLoading } = useSpace(projectUuid, spaceUuid);
    const { mutate, isLoading: isCreating } = useUpdateMutation(
        projectUuid,
        spaceUuid,
    );
    const [name, setName] = useState<string>('');

    useEffect(() => {
        if (!isLoading && data?.name) setName(data.name);
    }, [isLoading, data]);
    return (
        <Dialog
            icon="folder-close"
            isOpen={spaceUuid !== undefined}
            onClose={onClose}
            lazy
            title="Update space"
        >
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

                        <Tooltip2
                            disabled={!!name}
                            content="Name field is required"
                            position={Position.TOP}
                        >
                            <Button
                                data-cy="submit-base-modal"
                                intent={Intent.PRIMARY}
                                text="Update"
                                type="submit"
                                onClick={(e) => {
                                    mutate({ name });

                                    if (onClose) onClose();
                                    e.preventDefault();
                                }}
                                disabled={isCreating || !name}
                            />
                        </Tooltip2>
                    </div>
                </div>
            </form>
        </Dialog>
    );
};
