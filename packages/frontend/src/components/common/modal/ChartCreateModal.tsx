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
import { FC, useCallback, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useCreateMutation } from '../../../hooks/useSavedQuery';
import {
    useCreateMutation as useSpaceCreateMutation,
    useSpaceSummaries,
} from '../../../hooks/useSpaces';
import {
    CreateNewText,
    FormGroupWrapper,
} from '../../SavedQueries/SavedQueries.style';

interface ChartCreateModalProps extends DialogProps {
    savedData: CreateSavedChartVersion;
    onClose?: () => void;
    defaultSpaceUuid?: string;
    onConfirm: (savedData: CreateSavedChartVersion) => void;
}

const ChartCreateModal: FC<ChartCreateModalProps> = ({
    savedData,
    onClose,
    defaultSpaceUuid,
    ...modalProps
}) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { mutateAsync, isLoading: isCreating } = useCreateMutation();
    const { mutateAsync: createSpaceAsync, isLoading: isCreatingSpace } =
        useSpaceCreateMutation(projectUuid);

    const [spaceUuid, setSpaceUuid] = useState<string | undefined>();
    const [name, setName] = useState('');
    const [description, setDescription] = useState<string>();
    const [newSpaceName, setNewSpaceName] = useState('');
    const [shouldCreateNewSpace, setShouldCreateNewSpace] = useState(false);

    const { data: spaces, isLoading: isLoadingSpaces } = useSpaceSummaries(
        projectUuid,
        false,
        {
            onSuccess: (data) => {
                if (data.length > 0) {
                    const currentSpace = defaultSpaceUuid
                        ? data.find((space) => space.uuid === defaultSpaceUuid)
                        : data[0];
                    setSpaceUuid(currentSpace?.uuid);
                } else {
                    setShouldCreateNewSpace(true);
                }
            },
        },
    );
    const showSpaceInput = shouldCreateNewSpace || spaces?.length === 0;

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

    if (isLoadingSpaces || !spaces) return null;

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
                                options={spaces?.map((space) => ({
                                    value: space.uuid,
                                    label: space.name,
                                }))}
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
