import {
    Button,
    Classes,
    Dialog,
    InputGroup,
    Intent,
    Position,
} from '@blueprintjs/core';
import { Tooltip2 } from '@blueprintjs/popover2';
import { Space } from '@lightdash/common';
import { FC, useState } from 'react';
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

    const { mutate, isLoading: isCreating } = useCreateMutation(projectUuid, {
        onSuccess: (space: Space) => {
            onCreated?.(space);
        },
    });

    const [name, setName] = useState<string>('');

    return (
        <Dialog
            icon="folder-close"
            isOpen={isOpen}
            onClose={onClose}
            lazy
            title="Create space"
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
                                text="Create"
                                onClick={(e) => {
                                    mutate({ name });
                                    setName('');
                                    if (onClose && !onCreated) onClose();
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
