import {
    getDocumentUrl,
    ResourceViewItemType,
    type DuplicateDocumentRequest,
} from '@lightdash/common';
import { Button, Fieldset, Stack, Textarea, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconCopy } from '@tabler/icons-react';
import { useNavigate } from 'react-router';
import Callout from '../../components/common/Callout';
import EmptyStateLoader from '../../components/common/EmptyStateLoader';
import MantineModal from '../../components/common/MantineModal';
import SpaceSelector from '../../components/common/SpaceSelector/SpaceSelector';
import { useProjectUrlIdentifier } from '../../hooks/useProjectRoute';
import { useDocumentCreationSpaces } from './useDocumentCreationSpaces';
import { useDuplicateDocument } from './useDuplicateDocument';

type Props = {
    projectUuid: string;
    documentUuid: string;
    name: string;
    description: string;
    spaceUuid: string;
    opened: boolean;
    onClose: () => void;
};

const DocumentDuplicateModal = ({
    projectUuid,
    documentUuid,
    name,
    description,
    spaceUuid,
    opened,
    onClose,
}: Props) => {
    const spaces = useDocumentCreationSpaces(projectUuid);
    const duplicate = useDuplicateDocument(projectUuid, documentUuid);
    const navigate = useNavigate();
    const projectUrlIdentifier = useProjectUrlIdentifier();
    const form = useForm<DuplicateDocumentRequest>({
        initialValues: {
            name: `Copy of ${name}`,
            description,
            spaceUuid: spaces.writableSpaces.some(
                (space) => space.uuid === spaceUuid,
            )
                ? spaceUuid
                : '',
        },
        validate: {
            name: (value) => (value.trim() ? null : 'Enter a document name'),
        },
    });
    const hasDestination =
        !spaces.isError &&
        spaces.writableSpaces.some(
            (space) => space.uuid === form.values.spaceUuid,
        );
    const handleSubmit = form.onSubmit((values) => {
        if (!hasDestination || duplicate.isLoading) {
            return;
        }
        duplicate.mutate(
            { ...values, name: values.name.trim() },
            {
                onSuccess: (document) => {
                    onClose();
                    void navigate(
                        getDocumentUrl(
                            projectUrlIdentifier,
                            document.documentUuid,
                            document.slug,
                        ),
                    );
                },
            },
        );
    });

    return (
        <MantineModal
            opened={opened}
            onClose={() => {
                if (!duplicate.isLoading) {
                    onClose();
                }
            }}
            title="Duplicate document"
            icon={IconCopy}
            cancelDisabled={duplicate.isLoading}
            actions={
                <Button
                    type="submit"
                    form="duplicate-document-form"
                    loading={duplicate.isLoading}
                    disabled={!hasDestination || !form.values.name.trim()}
                >
                    Create duplicate
                </Button>
            }
        >
            <form id="duplicate-document-form" onSubmit={handleSubmit}>
                <Stack>
                    <TextInput
                        label="Document name"
                        required
                        disabled={duplicate.isLoading}
                        {...form.getInputProps('name')}
                    />
                    <Textarea
                        label="Description"
                        autosize
                        maxRows={3}
                        disabled={duplicate.isLoading}
                        {...form.getInputProps('description')}
                    />
                    {spaces.isLoading ? (
                        <EmptyStateLoader title="Loading spaces" />
                    ) : spaces.error ? (
                        <Callout variant="danger">
                            {spaces.error.error.message}
                        </Callout>
                    ) : (
                        <Fieldset
                            legend="Destination space"
                            disabled={duplicate.isLoading}
                        >
                            <SpaceSelector
                                projectUuid={projectUuid}
                                spaces={spaces.data}
                                selectedSpaceUuid={
                                    form.values.spaceUuid || null
                                }
                                onSelectSpace={(uuid) =>
                                    form.setFieldValue('spaceUuid', uuid ?? '')
                                }
                                itemType={ResourceViewItemType.DOCUMENT}
                            />
                        </Fieldset>
                    )}
                    {duplicate.error && (
                        <Callout variant="danger">
                            {duplicate.error.error.message}
                        </Callout>
                    )}
                </Stack>
            </form>
        </MantineModal>
    );
};

export default DocumentDuplicateModal;
