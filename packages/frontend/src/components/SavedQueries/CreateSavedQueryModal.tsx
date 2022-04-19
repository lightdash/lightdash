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
    const [description, setDescription] = useState<string>('');

    return (
        <Dialog isOpen={isOpen} onClose={onClose} lazy title="Save chart">
            <form>
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
                    <FormGroup
                        label="Chart description"
                        labelFor="chart-description"
                        style={{ fontWeight: 'bold' }}
                    >
                        <InputGroup
                            id="chart-description"
                            type="text"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="A few words to give your team some context"
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
                            type="submit"
                            onClick={(e) => {
                                mutate({ ...savedData, name, description });

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

export default CreateSavedQueryModal;
