import { type Document } from '@lightdash/common';
import { Button, Stack, Text } from '@mantine/core';
import { IconHistory } from '@tabler/icons-react';
import Callout from '../../components/common/Callout';
import MantineModal from '../../components/common/MantineModal';
import { useUpdateDocumentContent } from './useUpdateDocumentContent';

type Props = {
    document: Document;
    version: Document['version'];
    onClose: () => void;
    onRestored: () => void;
};

const DocumentVersionRestoreModal = ({
    document,
    version,
    onClose,
    onRestored,
}: Props) => {
    const update = useUpdateDocumentContent(
        document.projectUuid,
        document.documentUuid,
    );
    return (
        <MantineModal
            opened
            title="Restore document version"
            icon={IconHistory}
            onClose={() => {
                if (!update.isLoading) onClose();
            }}
            cancelDisabled={update.isLoading}
            actions={
                <Button
                    loading={update.isLoading}
                    disabled={update.error?.error.statusCode === 409}
                    onClick={() =>
                        update.mutate(
                            {
                                baseVersionUuid: document.version.versionUuid,
                                content: version.content,
                            },
                            { onSuccess: onRestored },
                        )
                    }
                >
                    Restore
                </Button>
            }
        >
            <Stack>
                <Text>
                    Restore version {version.versionNumber} as a new version of
                    this document? All previous versions will remain available.
                    The document's name and access will stay the same.
                </Text>
                {update.error && (
                    <Callout variant="danger">
                        {update.error.error.statusCode === 409
                            ? 'This document changed while you were restoring it. Nothing was restored. Close this dialog and select a version again to restore against the latest version.'
                            : update.error.error.message}
                    </Callout>
                )}
            </Stack>
        </MantineModal>
    );
};

export default DocumentVersionRestoreModal;
