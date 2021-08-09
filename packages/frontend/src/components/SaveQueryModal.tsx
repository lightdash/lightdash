import React, { FC, useEffect, useState } from 'react';
import {
    Button,
    Classes,
    Dialog,
    FormGroup,
    InputGroup,
    Intent,
} from '@blueprintjs/core';
import { SavedQuery } from 'common';
import { useApp } from '../providers/AppProvider';
import {
    useCreateMutation,
    useSavedQuery,
    useUpdateMutation,
} from '../hooks/useSavedQuery';

interface Props {
    isOpen: boolean;
    isDisabled: boolean;
    initialName?: string;
    onSave: (name: string) => void;
    onClose: () => void;
}

const SaveQueryModal: FC<Props> = ({
    isOpen,
    isDisabled,
    initialName,
    onSave,
    onClose,
}) => {
    const { showToastError } = useApp();
    const [name, setName] = useState<string | undefined>(initialName);

    useEffect(() => {
        setName(initialName);
    }, [initialName]);

    const handleSave = () => {
        if (name) {
            onSave(name);
        } else {
            showToastError({
                title: 'Required fields: name',
                timeout: 3000,
            });
        }
    };

    return (
        <Dialog
            isOpen={isOpen}
            onClose={() => (!isDisabled ? onClose() : undefined)}
            title="Save"
            lazy
            canOutsideClickClose
        >
            <div className={Classes.DIALOG_BODY}>
                <FormGroup
                    label="Name"
                    labelFor="name-input"
                    labelInfo="(required)"
                >
                    <InputGroup
                        id="name-input"
                        type="text"
                        required
                        disabled={isDisabled}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                    />
                </FormGroup>
            </div>
            <div className={Classes.DIALOG_FOOTER}>
                <div className={Classes.DIALOG_FOOTER_ACTIONS}>
                    <Button onClick={onClose}>Cancel</Button>
                    <Button
                        intent={Intent.PRIMARY}
                        text="Save"
                        onClick={handleSave}
                        loading={isDisabled}
                    />
                </div>
            </div>
        </Dialog>
    );
};

interface CreateSavedQueryModalProps {
    isOpen: boolean;
    onClose: () => void;
    queryData: Omit<SavedQuery, 'uuid' | 'name'>;
}

export const CreateSavedQueryModal: FC<CreateSavedQueryModalProps> = ({
    isOpen,
    queryData,
    onClose,
}) => {
    const { isLoading, mutate, status } = useCreateMutation();
    const onCreate = (name: string) => {
        mutate({
            name,
            ...queryData,
        });
    };

    useEffect(() => {
        if (status === 'success') {
            onClose();
        }
    }, [onClose, status]);
    return (
        <SaveQueryModal
            isOpen={isOpen}
            isDisabled={isLoading}
            onSave={onCreate}
            onClose={onClose}
        />
    );
};

interface UpdateSavedQueryModalProps {
    isOpen: boolean;
    onClose: () => void;
    savedQueryId: string;
}
export const UpdateSavedQueryModal: FC<UpdateSavedQueryModalProps> = ({
    isOpen,
    onClose,
    savedQueryId,
}) => {
    const { data, isLoading } = useSavedQuery({ id: savedQueryId });
    const {
        status,
        isLoading: isUpdating,
        mutate,
    } = useUpdateMutation(savedQueryId);
    const onUpdate = (name: string) => {
        mutate({ name });
    };
    useEffect(() => {
        if (status === 'success') {
            onClose();
        }
    }, [onClose, status]);

    return (
        <SaveQueryModal
            isOpen={isOpen}
            initialName={data?.name}
            isDisabled={isLoading || isUpdating}
            onSave={onUpdate}
            onClose={onClose}
        />
    );
};
