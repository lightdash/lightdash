import {
    Button,
    Classes,
    Dialog,
    FormGroup,
    InputGroup,
    Intent,
} from '@blueprintjs/core';
import { CreateSavedChartVersion } from 'common';
import React, { FC, useState } from 'react';
import { useCreateMutation } from '../../hooks/useSavedQuery';

interface CreateSavedQueryModalProps {
    isOpen: boolean;
    savedData: CreateSavedChartVersion;

    onClose?: () => void;
}

const CreateSavedQueryModal: FC<CreateSavedQueryModalProps> = ({
    isOpen,
    savedData,
    onClose,
}) => {
    const useCreate = useCreateMutation();
    const { mutate, isLoading: isCreating } = useCreate;
    const [name, setName] = useState<string>('');

    return (
        <Dialog isOpen={isOpen} onClose={onClose} lazy title="Save chart">
            {' '}
            <div className={Classes.DIALOG_BODY}>
                <FormGroup
                    label="Enter a memorable name for your chart"
                    labelFor="chart-name"
                    style={{ fontWeight: 'bold' }}
                >
                    <InputGroup
                        id="chart-name"
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="eg. How many weekly active users do we have?"
                    />
                </FormGroup>
            </div>
            <div className={Classes.DIALOG_FOOTER}>
                <div className={Classes.DIALOG_FOOTER_ACTIONS}>
                    <Button onClick={onClose}>Cancel</Button>
                    <Button
                        data-cy="submit-base-modal"
                        intent={Intent.SUCCESS}
                        text="Save"
                        onClick={() => {
                            mutate({ ...savedData, name });

                            if (onClose) onClose();
                        }}
                        disabled={isCreating || !name}
                    />
                </div>
            </div>
        </Dialog>
    );
};

export default CreateSavedQueryModal;
