import {
    type SnowflakeAiBoundaryAttribution,
    type SnowflakeAiBoundarySectionStatus,
} from '@lightdash/common';
import { Badge, Box, Stack, Text, Tooltip } from '@mantine/core';
import { type ReactNode } from 'react';
import CollapsableCard from '../common/CollapsableCard/CollapsableCard';

const STATUSES: Record<
    SnowflakeAiBoundarySectionStatus,
    { label: string; color: string }
> = {
    verified: { label: 'Verified', color: 'green' },
    marked_done: { label: 'Marked as done', color: 'gray' },
    needs_attention: { label: 'Needs attention', color: 'red' },
    not_started: { label: 'Not started', color: 'gray' },
};
export const GuideSection = ({
    id,
    title,
    summary,
    status,
    mark,
    isOpen,
    onToggle,
    children,
}: {
    id: string;
    title: string;
    summary: string;
    status: SnowflakeAiBoundarySectionStatus | null;
    mark?: SnowflakeAiBoundaryAttribution;
    isOpen: boolean;
    onToggle: (open: boolean) => void;
    children: ReactNode;
}) => (
    <Box id={`boundary-${id}`} tabIndex={-1}>
        <CollapsableCard
            minimal
            title={title}
            isOpen={isOpen}
            onToggle={onToggle}
            toggleTooltip={`${isOpen ? 'Collapse' : 'Expand'} ${title}`}
            rightHeaderElement={
                status && (
                    <Tooltip
                        disabled={status !== 'marked_done' || !mark}
                        label={
                            mark
                                ? `Marked as done by ${mark.name} on ${new Date(mark.at).toLocaleString()}`
                                : ''
                        }
                    >
                        <Badge size="sm" color={STATUSES[status].color}>
                            {STATUSES[status].label}
                        </Badge>
                    </Tooltip>
                )
            }
            headerElement={
                <Text size="xs" c="dimmed">
                    {summary}
                </Text>
            }
        >
            <Stack gap="sm" p="md">
                {children}
            </Stack>
        </CollapsableCard>
    </Box>
);
