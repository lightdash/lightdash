import {
    getDocumentUrl,
    ResourceViewItemType,
    type DuplicateDocumentRequest,
} from '@lightdash/common';
import { Button, Fieldset, Stack, Textarea, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconCopy } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
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
    spaceUuid: string | null;
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
    const { t } = useTranslation('documents');
    const spaces = useDocumentCreationSpaces(projectUuid);
    const duplicate = useDuplicateDocument(projectUuid, documentUuid);
    const navigate = useNavigate();
    const projectUrlIdentifier = useProjectUrlIdentifier();
    const form = useForm<DuplicateDocumentRequest>({
        initialValues: {
            name: t('duplicate.defaultName', { name }),
            description,
            spaceUuid:
                spaceUuid !== null &&
                spaces.writableSpaces.some((space) => space.uuid === spaceUuid)
                    ? spaceUuid
                    : '',
        },
        validate: {
            name: (value) => (value.trim() ? null : t('form.nameRequired')),
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
            title={t('duplicate.title')}
            icon={IconCopy}
            cancelDisabled={duplicate.isLoading}
            actions={
                <Button
                    type="submit"
                    form="duplicate-document-form"
                    loading={duplicate.isLoading}
                    disabled={!hasDestination || !form.values.name.trim()}
                >
                    {t('duplicate.submit')}
                </Button>
            }
        >
            <form id="duplicate-document-form" onSubmit={handleSubmit}>
                <Stack>
                    <TextInput
                        label={t('form.nameLabel')}
                        required
                        disabled={duplicate.isLoading}
                        {...form.getInputProps('name')}
                    />
                    <Textarea
                        label={t('form.descriptionLabel')}
                        autosize
                        maxRows={3}
                        disabled={duplicate.isLoading}
                        {...form.getInputProps('description')}
                    />
                    {spaces.isLoading ? (
                        <EmptyStateLoader title={t('form.loadingSpaces')} />
                    ) : spaces.error ? (
                        <Callout variant="danger">
                            {spaces.error.error.message}
                        </Callout>
                    ) : (
                        <Fieldset
                            legend={t('duplicate.destinationSpace')}
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
