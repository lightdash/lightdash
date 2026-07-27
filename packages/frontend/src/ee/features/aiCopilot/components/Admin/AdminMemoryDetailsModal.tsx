import { Box, Loader, Text } from '@mantine-8/core';
import { type FC } from 'react';
import MantineModal from '../../../../../components/common/MantineModal';
import { useAiAgentMemory } from '../../hooks/useAiAgentMemory';
import { MemoryDetailsModal } from '../MemoryDetails/MemoryDetails';

export type AdminMemorySelection = {
    projectUuid: string;
    agentUuid: string;
    slug: string;
    title: string;
};

type AdminMemoryDetailsModalProps = {
    selection: AdminMemorySelection;
    onClose: () => void;
};

/**
 * The admin list carries only a summary, so the full memory is fetched on open
 * and handed to the shared details modal.
 */
export const AdminMemoryDetailsModal: FC<AdminMemoryDetailsModalProps> = ({
    selection,
    onClose,
}) => {
    const { projectUuid, agentUuid, slug, title } = selection;
    const memoryQuery = useAiAgentMemory({ projectUuid, agentUuid, slug });

    if (memoryQuery.data) {
        return (
            <MemoryDetailsModal
                opened
                onClose={onClose}
                memory={memoryQuery.data}
                projectUuid={projectUuid}
                agentUuid={agentUuid}
            />
        );
    }

    return (
        <MantineModal
            opened
            onClose={onClose}
            title={title}
            cancelLabel={false}
        >
            <Box py="xl" ta="center">
                {memoryQuery.isError ? (
                    <Text c="dimmed" fz="sm">
                        Unable to load this memory.
                    </Text>
                ) : (
                    <Loader size="sm" color="gray" />
                )}
            </Box>
        </MantineModal>
    );
};
