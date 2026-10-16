import { type Document } from '@lightdash/common';
import { Button, Stack, Text } from '@mantine/core';
import { IconUserCircle } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Callout from '../../components/common/Callout';
import MantineModal from '../../components/common/MantineModal';
import { UserSelect } from '../../components/common/UserSelect';
import { useUpdateDocumentMetadata } from './useUpdateDocumentMetadata';

type Props = {
    document: Document;
    opened: boolean;
    onClose: () => void;
};

const DocumentOwnerModal = ({ document, opened, onClose }: Props) => {
    const { t } = useTranslation('documents');
    const [ownerUserUuid, setOwnerUserUuid] = useState(
        document.owner?.userUuid ?? null,
    );
    const update = useUpdateDocumentMetadata(
        document.projectUuid,
        document.documentUuid,
    );
    const isUnchanged = ownerUserUuid === (document.owner?.userUuid ?? null);

    return (
        <MantineModal
            opened={opened}
            onClose={() => {
                if (!update.isLoading) {
                    onClose();
                }
            }}
            title={t('owner.title')}
            icon={IconUserCircle}
            cancelDisabled={update.isLoading}
            actions={
                <Button
                    loading={update.isLoading}
                    disabled={isUnchanged}
                    onClick={() =>
                        update.mutate({ ownerUserUuid }, { onSuccess: onClose })
                    }
                >
                    {t('actions.save', { ns: 'common' })}
                </Button>
            }
        >
            <Stack>
                <Text fz="sm" c="dimmed">
                    {t('owner.description')}
                </Text>
                <UserSelect
                    label={t('owner.label')}
                    placeholder={t('owner.placeholder')}
                    value={ownerUserUuid}
                    onChange={setOwnerUserUuid}
                    disabled={update.isLoading}
                    clearable
                />
                {update.error && (
                    <Callout variant="danger">
                        {update.error.error.message}
                    </Callout>
                )}
            </Stack>
        </MantineModal>
    );
};

export default DocumentOwnerModal;
