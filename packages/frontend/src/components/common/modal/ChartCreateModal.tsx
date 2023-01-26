import {
    Button,
    Dialog,
    DialogBody,
    DialogFooter,
    DialogProps,
    HTMLSelect,
    InputGroup,
} from '@blueprintjs/core';
import { CreateSavedChartVersion } from '@lightdash/common';
import { FC, useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useCreateMutation } from '../../../hooks/useSavedQuery';
import {
    useCreateMutation as useSpaceCreateMutation,
    useSpaces,
} from '../../../hooks/useSpaces';
import {
    CreateNewText,
    FormGroupWrapper,
} from '../../SavedQueries/SavedQueries.style';

interface ChartCreateModalProps extends DialogProps {
    savedData: CreateSavedChartVersion;
    onClose?: () => void;
    onConfirm: (savedData: CreateSavedChartVersion) => void;
}

const ChartCreateModal: FC<ChartCreateModalProps> = ({
    savedData,
    onClose,
    onConfirm,
    ...modalProps
}) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();

    const { data: spaces } = useSpaces(projectUuid);
    const { mutateAsync, isLoading: isCreating } = useCreateMutation();
    const { mutateAsync: createSpaceAsync, isLoading: isCreatingSpace } =
        useSpaceCreateMutation(projectUuid);

    const [spaceUuid, setSpaceUuid] = useState<string | undefined>();
    const [name, setName] = useState('');
    const [description, setDescription] = useState<string>();
    const [newSpaceName, setNewSpaceName] = useState('');
    const [shouldCreateNewSpace, setShouldCreateNewSpace] = useState(false);

    const showSpaceInput = shouldCreateNewSpace || spaces?.length === 0;

    useEffect(() => {
        if (spaceUuid === undefined && spaces && spaces.length > 0) {
            setSpaceUuid(spaces[0].uuid);
        }
    }, [spaces, spaceUuid]);

    const handleClose = useCallback(() => {
        setName('');
        setDescription('');
        setNewSpaceName('');
        setSpaceUuid(undefined);
        setShouldCreateNewSpace(false);

        onClose?.();
    }, [onClose]);

    const handleConfirm = useCallback(async () => {
        let newSpace = showSpaceInput
            ? await createSpaceAsync({
                  name: newSpaceName,
                  access: [],
                  isPrivate: true,
              })
            : undefined;

        const savedQuery = mutateAsync({
            ...savedData,
            name,
            description,
            spaceUuid: newSpace?.uuid || spaceUuid,
        });

        setName('');
        setDescription('');
        setNewSpaceName('');
        setSpaceUuid(undefined);
        setShouldCreateNewSpace(false);

        return savedQuery;
    }, [
        name,
        description,
        savedData,
        spaceUuid,
        newSpaceName,
        createSpaceAsync,
        mutateAsync,
        showSpaceInput,
    ]);

    return (
        <Dialog
            lazy
            title="Save chart"
            icon="chart"
            {...modalProps}
            onClose={handleClose}
        >
            <DialogBody>
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

                {!showSpaceInput && (
                    <>
                        <FormGroupWrapper
                            label="Select space"
                            labelFor="select-space"
                        >
                            <HTMLSelect
                                id="select-space"
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
                        </FormGroupWrapper>

                        <CreateNewText
                            onClick={() => setShouldCreateNewSpace(true)}
                        >
                            + Create new space
                        </CreateNewText>
                    </>
                )}
                {showSpaceInput && (
                    <FormGroupWrapper label="Space" labelFor="new-space">
                        <InputGroup
                            id="new-space"
                            type="text"
                            value={newSpaceName}
                            onChange={(e) => setNewSpaceName(e.target.value)}
                            placeholder="eg. KPIs"
                        />
                    </FormGroupWrapper>
                )}
            </DialogBody>

            <DialogFooter
                actions={
                    <>
                        <Button onClick={handleClose}>Cancel</Button>

                        <Button
                            data-cy="submit-base-modal"
                            intent="primary"
                            text="Save"
                            onClick={handleConfirm}
                            disabled={
                                isCreating ||
                                isCreatingSpace ||
                                !name ||
                                (showSpaceInput && !newSpaceName)
                            }
                        />
                    </>
                }
            />
        </Dialog>
    );
};

export default ChartCreateModal;
