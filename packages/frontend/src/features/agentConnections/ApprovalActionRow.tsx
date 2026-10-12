import { AgentCapability, getAgentCapabilityName } from '@lightdash/common';
import { Box, Button, Checkbox, Stack, Text } from '@mantine/core';
import { useId, useState } from 'react';
import { type getApprovalActions } from './approvalSelection';

type Props = {
    action: ReturnType<typeof getApprovalActions>[number];
    projectCount: number;
    checked: boolean;
    disabled: boolean;
    onChange: () => void;
};

export const ApprovalActionRow = ({
    action,
    projectCount,
    checked,
    disabled,
    onChange,
}: Props) => {
    const descriptionId = useId();
    const [expanded, setExpanded] = useState(false);
    const reasons = [
        ...new Set(action.blocked.map(({ reason }) => reason).filter(Boolean)),
    ];
    const mixed = action.offered > 0 && action.offered < projectCount;
    const warning =
        action.capability === AgentCapability.Delete
            ? 'Deleted content cannot be restored by the agent.'
            : action.capability === AgentCapability.Publish
              ? 'Other people will see what the agent publishes.'
              : null;
    return (
        <Box component="section">
            <Checkbox
                label={getAgentCapabilityName(action.capability)}
                checked={checked}
                disabled={disabled || action.offered === 0}
                onChange={onChange}
                aria-describedby={descriptionId}
            />
            <Stack id={descriptionId} gap="xs" mt="xs" ml="lg">
                {warning && (
                    <Text size="xs" c="orange">
                        {warning}
                    </Text>
                )}
                {action.offered === 0 &&
                    (reasons.length === 1 ? (
                        <Text size="xs" c="dimmed">
                            {reasons[0]}
                        </Text>
                    ) : (
                        action.blocked.map((blocked) => (
                            <Text
                                key={blocked.projectUuid}
                                size="xs"
                                c="dimmed"
                            >
                                {blocked.name}: {blocked.reason}
                            </Text>
                        ))
                    ))}
                {mixed && (
                    <>
                        <Text size="xs" c="dimmed">
                            Available in {action.offered} of {projectCount}{' '}
                            selected projects
                        </Text>
                        {action.blocked.length > 0 && (
                            <>
                                <Button
                                    variant="subtle"
                                    size="compact-xs"
                                    aria-expanded={expanded}
                                    aria-controls={`${descriptionId}-restrictions`}
                                    onClick={() =>
                                        setExpanded((value) => !value)
                                    }
                                >
                                    {expanded
                                        ? 'Hide restrictions'
                                        : 'Show restrictions'}
                                </Button>
                                {expanded && (
                                    <Box id={`${descriptionId}-restrictions`}>
                                        {action.blocked.map((blocked) => (
                                            <Text
                                                key={blocked.projectUuid}
                                                size="xs"
                                                c="dimmed"
                                            >
                                                {blocked.name}: {blocked.reason}
                                            </Text>
                                        ))}
                                    </Box>
                                )}
                            </>
                        )}
                    </>
                )}
            </Stack>
        </Box>
    );
};
