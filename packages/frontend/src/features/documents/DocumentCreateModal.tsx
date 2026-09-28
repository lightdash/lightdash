import { getDocumentUrl, ResourceViewItemType } from '@lightdash/common';
import { Button, Fieldset, Stack, Textarea, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconFileText } from '@tabler/icons-react';
import { useNavigate } from 'react-router';
import Callout from '../../components/common/Callout';
import EmptyStateLoader from '../../components/common/EmptyStateLoader';
import MantineModal from '../../components/common/MantineModal';
import SpaceSelector from '../../components/common/SpaceSelector/SpaceSelector';
import { useProjectUrlIdentifier } from '../../hooks/useProjectRoute';
import { type DocumentNavigationState } from './documentNavigation';
import { useCreateDocument } from './useCreateDocument';
import { useDocumentCreationSpaces } from './useDocumentCreationSpaces';

type Props = {
    projectUuid: string;
    /** Preselected when the viewer can create Documents there. */
    defaultSpaceUuid: string | null;
    onClose: () => void;
};

const FORM_ID = 'create-document-form';

const DocumentCreateModal = ({
    projectUuid,
    defaultSpaceUuid,
    onClose,
}: Props) => {
    const spaces = useDocumentCreationSpaces(projectUuid);
    const create = useCreateDocument(projectUuid);
    const navigate = useNavigate();
    const projectUrlIdentifier = useProjectUrlIdentifier();
    const form = useForm({
        initialValues: { name: '', description: '', spaceUuid: '' },
        validate: {
            name: (value) => (value.trim() ? null : 'Enter a document name'),
        },
    });
    // Resolve the preselection once spaces load, without clobbering a choice
    const selectedSpaceUuid =
        form.values.spaceUuid ||
        (spaces.writableSpaces.some((space) => space.uuid === defaultSpaceUuid)
            ? (defaultSpaceUuid ?? '')
            : '');
    const hasDestination =
        !spaces.isError &&
        spaces.writableSpaces.some((space) => space.uuid === selectedSpaceUuid);
    const handleSubmit = form.onSubmit((values) => {
        if (!hasDestination || create.isLoading) {
            return;
        }
        create.mutate(
            {
                name: values.name.trim(),
                description: values.description.trim(),
                spaceUuid: selectedSpaceUuid,
                schemaVersion: 1,
                content: { cells: [] },
            },
            {
                onSuccess: (document) => {
                    onClose();
                    const state: DocumentNavigationState = {
                        startEditing: true,
                    };
                    void navigate(
                        getDocumentUrl(
                            projectUrlIdentifier,
                            document.documentUuid,
                            document.slug,
                        ),
                        { state },
                    );
                },
            },
        );
    });

    return (
        <MantineModal
            opened
            onClose={() => {
                if (!create.isLoading) {
                    onClose();
                }
            }}
            title="Create document"
            icon={IconFileText}
            cancelDisabled={create.isLoading}
            actions={
                <Button
                    type="submit"
                    form={FORM_ID}
                    loading={create.isLoading}
                    disabled={!hasDestination || !form.values.name.trim()}
                >
                    Create
                </Button>
            }
        >
            <form id={FORM_ID} onSubmit={handleSubmit}>
                <Stack>
                    <TextInput
                        label="Document name"
                        placeholder="eg. Weekly revenue review"
                        required
                        data-autofocus
                        disabled={create.isLoading}
                        {...form.getInputProps('name')}
                    />
                    <Textarea
                        label="Description"
                        placeholder="A few words to give your team some context"
                        autosize
                        maxRows={3}
                        disabled={create.isLoading}
                        {...form.getInputProps('description')}
                    />
                    {spaces.isLoading ? (
                        <EmptyStateLoader title="Loading spaces" />
                    ) : spaces.error ? (
                        <Callout variant="danger">
                            {spaces.error.error.message}
                        </Callout>
                    ) : spaces.writableSpaces.length === 0 ? (
                        <Callout variant="warning">
                            You do not have permission to create documents in
                            any space in this project.
                        </Callout>
                    ) : (
                        <Fieldset legend="Space" disabled={create.isLoading}>
                            <SpaceSelector
                                projectUuid={projectUuid}
                                spaces={spaces.data}
                                selectedSpaceUuid={selectedSpaceUuid || null}
                                onSelectSpace={(uuid) =>
                                    form.setFieldValue('spaceUuid', uuid ?? '')
                                }
                                itemType={ResourceViewItemType.DOCUMENT}
                            />
                        </Fieldset>
                    )}
                    {create.error && (
                        <Callout variant="danger">
                            {create.error.error.message}
                        </Callout>
                    )}
                </Stack>
            </form>
        </MantineModal>
    );
};

export default DocumentCreateModal;
