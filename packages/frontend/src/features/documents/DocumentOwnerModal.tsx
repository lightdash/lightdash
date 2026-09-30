import { type Document } from '@lightdash/common';
import { Button, Stack, Text } from '@mantine/core';
import { IconUserCircle } from '@tabler/icons-react';
import { useState } from 'react';
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
            title="Document owner"
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
                    Save
                </Button>
            }
        >
            <Stack>
                <Text fz="sm" c="dimmed">
                    The owner is accountable for this document. Assigning an
                    owner does not change who can view or edit it.
                </Text>
                <UserSelect
                    label="Owner"
                    placeholder="Assign an owner..."
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
