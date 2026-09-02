import {
    ExternalSourceStatus,
    type ExternalSourceRef,
} from '@lightdash/common';
import { Button, Group, Loader, Stack, Text } from '@mantine/core';
import { IconUpload } from '@tabler/icons-react';
import { useEffect, useState, type FC } from 'react';
import Callout from '../../../components/common/Callout';
import MantineModal from '../../../components/common/MantineModal';
import useToaster from '../../../hooks/toaster/useToaster';
import {
    useExternalSource,
    useInvalidateTables,
    useReplaceCsvFile,
} from '../hooks/useExternalSources';
import { CsvDropzone } from './CsvDropzone';

type Props = {
    projectUuid: string;
    sourceRef: ExternalSourceRef;
    tableLabel: string;
    opened: boolean;
    onClose: () => void;
};

export const ReplaceCsvFileModal: FC<Props> = ({
    projectUuid,
    sourceRef,
    tableLabel,
    opened,
    onClose,
}) => {
    const { showToastSuccess } = useToaster();
    const replaceMutation = useReplaceCsvFile(projectUuid);
    const [isIngesting, setIsIngesting] = useState(false);
    const invalidateTables = useInvalidateTables();
    const { data: source } = useExternalSource(
        projectUuid,
        isIngesting ? sourceRef.sourceUuid : undefined,
        { poll: true },
    );

    const handleClose = () => {
        replaceMutation.reset();
        setIsIngesting(false);
        onClose();
    };

    const isReady =
        isIngesting && source?.status === ExternalSourceStatus.READY;
    // Reacting to a server-state transition (re-ingest finished) — a
    // legitimate external-system sync.
    useEffect(() => {
        if (!isReady) return;
        void invalidateTables(projectUuid);
        showToastSuccess({ title: `${tableLabel} re-imported` });
        handleClose();
        // eslint-disable-next-line react-hooks/exhaustive-deps -- fire once on the ready transition
    }, [isReady]);

    return (
        <MantineModal
            opened={opened}
            onClose={handleClose}
            title="Replace file"
            icon={IconUpload}
            size="lg"
        >
            <Stack gap="md">
                {!isIngesting && (
                    <>
                        <Callout
                            variant="warning"
                            title="Replacing re-imports the table"
                        >
                            Charts built on columns the new file drops will stop
                            working.
                        </Callout>
                        <CsvDropzone
                            isUploading={replaceMutation.isLoading}
                            onFile={(file) =>
                                replaceMutation.mutate(
                                    {
                                        sourceUuid: sourceRef.sourceUuid,
                                        file,
                                    },
                                    { onSuccess: () => setIsIngesting(true) },
                                )
                            }
                        />
                    </>
                )}
                {isIngesting &&
                    (source?.status === ExternalSourceStatus.ERROR ? (
                        <Stack gap="md">
                            <Callout
                                variant="danger"
                                title="We couldn't import this file"
                            >
                                {source.errorMessage ??
                                    'Something went wrong while re-importing the table.'}
                            </Callout>
                            <Group justify="flex-end">
                                <Button
                                    variant="default"
                                    onClick={() => {
                                        replaceMutation.reset();
                                        setIsIngesting(false);
                                    }}
                                >
                                    Try another file
                                </Button>
                            </Group>
                        </Stack>
                    ) : (
                        <Stack gap="xs" align="center" py="lg">
                            <Loader size="sm" />
                            <Text fz="sm" fw={500}>
                                Re-importing {tableLabel}…
                            </Text>
                        </Stack>
                    ))}
            </Stack>
        </MantineModal>
    );
};
