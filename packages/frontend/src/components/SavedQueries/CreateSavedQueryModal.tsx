import { Button, Classes, Dialog, InputGroup, Intent } from '@blueprintjs/core';
import { CreateSavedChartVersion } from '@lightdash/common';
import React, { FC, useState } from 'react';
import { useCreateMutation } from '../../hooks/useSavedQuery';
import { FormGroupWrapper } from './SavedQueries.style';

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
    const [description, setDescription] = useState<string>();

    return (
        <Dialog isOpen={isOpen} onClose={onClose} lazy title="Save chart">
            <form>
                <div className={Classes.DIALOG_BODY}>
                    <FormGroupWrapper
                        label="Enter a memorable name for your chart"
                        labelFor="chart-name"
                    >
                        <InputGroup
                            id="chart-name"
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="eg. How many weekly active users do we have?"
                        />
                    </FormGroupWrapper>
                    <FormGroupWrapper
                        label="Chart description"
                        labelFor="chart-description"
                    >
                        <InputGroup
                            id="chart-description"
                            type="text"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="A few words to give your team some context"
                        />
                    </FormGroupWrapper>
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
