import type {
    AiAgentMemoryEditableStatus,
    AiAgentMemoryStatus,
} from '@lightdash/common';
import {
    Box,
    Button,
    Group,
    Menu,
    Text,
    UnstyledButton,
} from '@mantine-8/core';
import { IconChevronDown } from '@tabler/icons-react';
import { type FC } from 'react';
import { useUpdateAiAgentMemoryStatus } from '../../hooks/useAiAgentMemory';
import { MEMORY_STATUS_LABELS } from '../Admin/memoryStatus';
import styles from './MemoryDetails.module.css';

type Props = {
    projectUuid: string;
    agentUuid: string;
    slug: string;
    status: AiAgentMemoryStatus;
};

const editableStatuses: AiAgentMemoryEditableStatus[] = ['active', 'retired'];

export const MemoryStatusMenu: FC<Props> = ({
    projectUuid,
    agentUuid,
    slug,
    status,
}) => {
    const updateStatus = useUpdateAiAgentMemoryStatus();

    if (status === 'superseded') {
        return (
            <Group gap={8} wrap="nowrap">
                <Box className={styles.statusDot} data-status={status} />
                <Text className={styles.railText}>
                    {MEMORY_STATUS_LABELS[status]}
                </Text>
            </Group>
        );
    }

    return (
        <Menu width={144} position="bottom-start" shadow="sm" withinPortal>
            <Menu.Target>
                <UnstyledButton
                    className={styles.statusTrigger}
                    aria-label="Change memory status"
                    onClick={(event) => event.stopPropagation()}
                    onPointerDown={(event) => event.stopPropagation()}
                >
                    <Group gap={8} wrap="nowrap">
                        <Box
                            className={styles.statusDot}
                            data-status={status}
                        />
                        <Text className={styles.railText}>
                            {MEMORY_STATUS_LABELS[status]}
                        </Text>
                        <IconChevronDown size={13} aria-hidden />
                    </Group>
                </UnstyledButton>
            </Menu.Target>
            <Menu.Dropdown
                onClick={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
            >
                {editableStatuses.map((nextStatus) => (
                    <Menu.Item
                        key={nextStatus}
                        disabled={
                            nextStatus === status || updateStatus.isLoading
                        }
                        onClick={() =>
                            updateStatus.mutate({
                                projectUuid,
                                agentUuid,
                                slug,
                                status: nextStatus,
                            })
                        }
                    >
                        {MEMORY_STATUS_LABELS[nextStatus]}
                    </Menu.Item>
                ))}
            </Menu.Dropdown>
        </Menu>
    );
};

export const MemoryStatusAction: FC<Props> = ({
    projectUuid,
    agentUuid,
    slug,
    status,
}) => {
    const updateStatus = useUpdateAiAgentMemoryStatus();

    if (status === 'superseded') return null;

    const nextStatus = status === 'active' ? 'retired' : 'active';
    const label = status === 'active' ? 'Retire memory' : 'Reactivate memory';

    return (
        <Button
            variant="default"
            size="xs"
            loading={updateStatus.isLoading}
            onClick={() =>
                updateStatus.mutate({
                    projectUuid,
                    agentUuid,
                    slug,
                    status: nextStatus,
                })
            }
        >
            {label}
        </Button>
    );
};
