import { type ConnectionCheckStatus } from '@lightdash/common';
import { Group, Loader, Text, Timeline } from '@mantine-8/core';
import {
    IconCircle,
    IconCircleCheck,
    IconCircleX,
    IconMinus,
} from '@tabler/icons-react';
import { type FC, type ReactNode } from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';

export type StepChecklistItem = {
    id: string;
    label: string;
    status: ConnectionCheckStatus;
    durationMs: number | null;
};

type StepChecklistProps = {
    items: StepChecklistItem[];
    hasFailure: boolean;
};

const statusBullet = (status: ConnectionCheckStatus): ReactNode => {
    switch (status) {
        case 'passed':
            return <MantineIcon icon={IconCircleCheck} color="green" />;
        case 'failed':
            return <MantineIcon icon={IconCircleX} color="red" />;
        case 'running':
            return <Loader size="xs" />;
        case 'skipped':
            return <MantineIcon icon={IconMinus} color="dimmed" />;
        case 'pending':
        default:
            return <MantineIcon icon={IconCircle} color="dimmed" />;
    }
};

const formatDuration = (durationMs: number | null): string | null => {
    if (durationMs === null) return null;
    if (durationMs < 1000) return `${Math.round(durationMs)}ms`;
    return `${(durationMs / 1000).toFixed(1)}s`;
};

const StepChecklist: FC<StepChecklistProps> = ({ items, hasFailure }) => {
    const activeIndex = items.reduce(
        (acc, item, index) =>
            item.status === 'passed' || item.status === 'failed' ? index : acc,
        -1,
    );

    return (
        <Timeline
            active={activeIndex}
            bulletSize={24}
            lineWidth={2}
            role="status"
            aria-live={hasFailure ? 'assertive' : 'polite'}
        >
            {items.map((item) => {
                const duration = formatDuration(item.durationMs);
                return (
                    <Timeline.Item
                        key={item.id}
                        bullet={statusBullet(item.status)}
                        title={
                            <Group justify="space-between" wrap="nowrap">
                                <Text
                                    size="sm"
                                    c={
                                        item.status === 'pending'
                                            ? 'dimmed'
                                            : undefined
                                    }
                                >
                                    {item.label}
                                </Text>
                                {duration && (
                                    <Text size="xs" c="dimmed">
                                        {duration}
                                    </Text>
                                )}
                            </Group>
                        }
                    />
                );
            })}
        </Timeline>
    );
};

export default StepChecklist;
