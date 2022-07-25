import {
    Button,
    Classes,
    Dialog,
    HTMLSelect,
    InputGroup,
    Intent,
} from '@blueprintjs/core';
import { CreateSavedChartVersion } from '@lightdash/common';
import React, { FC, useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useCreateMutation } from '../../hooks/useSavedQuery';
import {
    useCreateMutation as useSpaceCreateMutation,
    useSpaces,
} from '../../hooks/useSpaces';
import { CreateNewText, FormGroupWrapper } from './SavedQueries.style';

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
    const { projectUuid } = useParams<{ projectUuid: string }>();

    const { data: spaces } = useSpaces(projectUuid);
    const useCreate = useCreateMutation();
    const { mutate, isLoading: isCreating } = useCreate;
    const [name, setName] = useState<string>('');
    const [description, setDescription] = useState<string>();
    const [spaceUuid, setSpaceUuid] = useState<string | undefined>();
    const {
        data: newSpace,
        mutate: spaceCreateMutation,
        isSuccess: hasCreateSpace,
        isLoading: isCreatingSpace,
        reset,
    } = useSpaceCreateMutation(projectUuid);
    const [newSpaceName, setNewSpaceName] = useState<string>('');

    const [showNewSpaceInput, setShowNewSpaceInput] = useState<boolean>(false);

    useEffect(() => {
        if (spaceUuid === undefined && spaces && spaces.length > 0) {
            setSpaceUuid(spaces[0].uuid);
        }
    }, [spaces, spaceUuid]);

    const createSavedChart = useCallback(
        (selectedSpaceUuid) => {
            mutate({
                ...savedData,
                name,
                description,
                spaceUuid: selectedSpaceUuid,
            });

            setNewSpaceName('');
            setShowNewSpaceInput(false);
            if (onClose) onClose();
        },
        [mutate, description, name, onClose, savedData],
    );
    useEffect(() => {
        if (hasCreateSpace && newSpace) {
            createSavedChart(newSpace.uuid);
            reset();
        }
    }, [hasCreateSpace, newSpace, createSavedChart, reset]);

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
                    {!showNewSpaceInput && (
                        <>
                            <p>
                                <b>Select a space</b>
                            </p>
                            <HTMLSelect
                                id="select-dashboard"
                                fill={true}
                                value={spaceUuid}
                                onChange={(e) =>
                                    setSpaceUuid(e.currentTarget.value)
                                }
                                options={
                                    spaces
                                        ? spaces?.map((space) => ({
                                              value: space.uuid,
                                              label: space.name,
                                          }))
                                        : []
                                }
                            />

                            <CreateNewText
                                onClick={() => setShowNewSpaceInput(true)}
                            >
                                + Create new space
                            </CreateNewText>
                        </>
                    )}

                    {showNewSpaceInput && (
                        <>
                            <p>
                                <b>Space</b>
                            </p>
                            <InputGroup
                                id="chart-space"
                                type="text"
                                value={newSpaceName}
                                onChange={(e) =>
                                    setNewSpaceName(e.target.value)
                                }
                                placeholder="eg. KPIs"
                            />
                        </>
                    )}
                </div>
                <div className={Classes.DIALOG_FOOTER}>
                    <div className={Classes.DIALOG_FOOTER_ACTIONS}>
                        <Button
                            onClick={() => {
                                setNewSpaceName('');
                                setShowNewSpaceInput(false);
                                if (onClose) onClose();
                            }}
                        >
                            Cancel
                        </Button>
                        <Button
                            data-cy="submit-base-modal"
                            intent={Intent.SUCCESS}
                            text="Save"
                            type="submit"
                            onClick={(e) => {
                                e.preventDefault();

                                if (showNewSpaceInput) {
                                    // We create first a space
                                    // Then we will create the saved chart
                                    // on isSuccess hook
                                    spaceCreateMutation({
                                        name: newSpaceName,
                                    });
                                } else {
                                    createSavedChart(spaceUuid);
                                }
                            }}
                            disabled={
                                isCreating ||
                                !name ||
                                (showNewSpaceInput && !newSpaceName)
                            }
                        />
                    </div>
                </div>
            </form>
        </Dialog>
    );
};

export default CreateSavedQueryModal;
