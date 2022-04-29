import { Button, Classes, Dialog, InputGroup, Intent } from '@blueprintjs/core';
import React, { FC, useEffect, useState } from 'react';
import { useSavedQuery, useUpdateMutation } from '../../hooks/useSavedQuery';
import { FormGroupWrapper } from './SavedQueries.style';

interface Props {
    savedChartUuid: string;
    isOpen: boolean;

    onClose?: () => void;
}

const RenameSavedChartModal: FC<Props> = ({
    savedChartUuid,
    isOpen,
    onClose,
}) => {
    const { data, isLoading } = useSavedQuery({ id: savedChartUuid });
    const { mutate, isLoading: isSaving } = useUpdateMutation(savedChartUuid);
    const [name, setName] = useState<string>('');
    const [description, setDescription] = useState<string>();

    useEffect(() => {
        if (data) {
            setName(data.name);
            setDescription(data.description);
        }
    }, [data]);

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
                            disabled={isLoading}
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
                            disabled={isLoading}
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
                                mutate({ name, description });

                                if (onClose) onClose();
                                e.preventDefault();
                            }}
                            disabled={isLoading || isSaving || !name}
                        />
                    </div>
                </div>
            </form>
        </Dialog>
    );
};

export default RenameSavedChartModal;
