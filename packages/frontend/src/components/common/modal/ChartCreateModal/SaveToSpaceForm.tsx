import { subject } from '@casl/ability';
import { FeatureFlags, type SpaceSummary } from '@lightdash/common';
import { Button, Select, Stack, TextInput } from '@mantine/core';
import { type UseFormReturnType } from '@mantine/form';
import { IconArrowLeft, IconPlus } from '@tabler/icons-react';
import { useEffect } from 'react';
import { useFeatureFlagEnabled } from '../../../../hooks/useFeatureFlagEnabled';
import { type useSpaceManagement } from '../../../../hooks/useSpaceManagement';
import { Can } from '../../../../providers/Ability';
import useApp from '../../../../providers/App/useApp';
import MantineIcon from '../../MantineIcon';
import SpaceCreationForm from '../../SpaceSelector/SpaceCreationForm';
import SpaceSelector from '../../SpaceSelector/SpaceSelector';
import { type SaveToSpaceFormType } from './types';

type Props<T extends SaveToSpaceFormType> = {
    form: UseFormReturnType<T>;
    isLoading: boolean;
    spaces: SpaceSummary[] | undefined;
    projectUuid?: string;
    spaceManagement: ReturnType<typeof useSpaceManagement>;
    selectedSpaceName?: string;
};

const SaveToSpaceFormSimple = <T extends SaveToSpaceFormType>({
    form,
    isLoading,
    spaces,
    projectUuid,
    spaceManagement,
}: Props<T>) => {
    const { user } = useApp();

    useEffect(() => {
        if (spaceManagement.isCreatingNewSpace && form.values.newSpaceName) {
            spaceManagement.setNewSpaceName(form.values.newSpaceName);
        }
    }, [spaceManagement, form.values.newSpaceName]);

    if (spaceManagement.isCreatingNewSpace) {
        return (
            <Stack spacing="xs">
                <TextInput
                    size="xs"
                    label="Space"
                    description="Create a new space to add this chart to"
                    placeholder="eg. KPIs"
                    {...form.getInputProps('newSpaceName')}
                />
                <Button
                    disabled={isLoading}
                    size="xs"
                    variant="default"
                    mr="auto"
                    compact
                    onClick={() => {
                        // @ts-ignore, mantine form is not well typed to support generic + null value setting
                        form.setFieldValue('newSpaceName', null);
                    }}
                    leftIcon={<MantineIcon icon={IconArrowLeft} />}
                >
                    Save to existing space
                </Button>
            </Stack>
        );
    }

    return (
        <Stack spacing="xs">
            <Select
                size="xs"
                searchable
                label="Space"
                description="Select a space to save the chart directly to"
                withinPortal
                data={
                    spaces?.map((space) => ({
                        value: space.uuid,
                        label: space.name,
                    })) ?? []
                }
                {...form.getInputProps('spaceUuid')}
                required
            />
            <Can
                I="create"
                this={subject('Space', {
                    organizationUuid: user.data?.organizationUuid,
                    projectUuid,
                })}
            >
                {' '}
                <Button
                    disabled={isLoading}
                    size="xs"
                    variant="default"
                    mr="auto"
                    compact
                    leftIcon={<MantineIcon icon={IconPlus} />}
                    onClick={() => spaceManagement.setIsCreatingNewSpace(true)}
                >
                    Create new space
                </Button>
            </Can>
        </Stack>
    );
};

const SaveToSpaceForm = <T extends SaveToSpaceFormType>({
    form,
    isLoading,
    spaces = [],
    projectUuid,
    spaceManagement,
    selectedSpaceName,
}: Props<T>) => {
    const isNestedSpacesEnabled = useFeatureFlagEnabled(
        FeatureFlags.NestedSpaces,
    );

    if (!isNestedSpacesEnabled) {
        return (
            <SaveToSpaceFormSimple
                form={form}
                isLoading={isLoading}
                spaces={spaces}
                projectUuid={projectUuid}
                spaceManagement={spaceManagement}
                selectedSpaceName={selectedSpaceName}
            />
        );
    }

    const {
        isCreatingNewSpace,
        newSpaceName,
        setNewSpaceName,
        selectedSpaceUuid,
        setSelectedSpaceUuid,
        closeCreateSpaceForm,
    } = spaceManagement;

    if (isCreatingNewSpace) {
        return (
            <SpaceCreationForm
                spaceName={newSpaceName}
                onSpaceNameChange={(value) => {
                    setNewSpaceName(value);
                    // @ts-ignore - form types are complex with generics
                    form.setFieldValue('newSpaceName', value);
                }}
                onCancel={() => {
                    closeCreateSpaceForm();
                    // @ts-ignore - form types are complex with generics
                    form.setFieldValue('newSpaceName', null);
                }}
                isLoading={isLoading}
                parentSpaceName={selectedSpaceName}
            />
        );
    }

    return (
        <SpaceSelector
            spaces={spaces}
            selectedSpaceUuid={selectedSpaceUuid}
            onSelectSpace={(spaceUuid: string | null) => {
                setSelectedSpaceUuid(spaceUuid);
                // @ts-ignore, mantine form is not well typed to support generic + null value setting
                form.setFieldValue('spaceUuid', spaceUuid);
            }}
            isLoading={isLoading}
        />
    );
};

export default SaveToSpaceForm;
