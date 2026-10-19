import { AgentCapability, getAgentCapabilityName } from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Checkbox,
    Group,
    Stack,
    Text,
    Tooltip,
    VisuallyHidden,
} from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import { useId } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
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
    const reasons = [
        ...new Set(action.blocked.map(({ reason }) => reason).filter(Boolean)),
    ];
    const blockedEverywhere = action.offered === 0;
    const mixed = action.offered > 0 && action.offered < projectCount;
    const warning =
        action.capability === AgentCapability.Delete
            ? 'Deleted content cannot be restored by the agent.'
            : action.capability === AgentCapability.Publish
              ? 'Other people will see what the agent publishes.'
              : null;
    const restrictions = [
        ...(mixed
            ? [
                  `Available in ${action.offered} of ${projectCount} selected projects`,
              ]
            : []),
        ...(blockedEverywhere && reasons.length === 1
            ? reasons
            : action.blocked.map(
                  (blocked) => `${blocked.name}: ${blocked.reason}`,
              )),
    ];
    const showRestrictions = blockedEverywhere || mixed;
    return (
        <Box component="section">
            <Group gap="xs" wrap="nowrap">
                <Checkbox
                    label={getAgentCapabilityName(action.capability)}
                    checked={checked}
                    disabled={disabled || blockedEverywhere}
                    onChange={onChange}
                    aria-describedby={descriptionId}
                />
                {showRestrictions && (
                    <Tooltip
                        events={{ hover: true, focus: true, touch: false }}
                        multiline
                        position="right"
                        maw={320}
                        label={
                            <Stack gap="xxs">
                                {restrictions.map((line) => (
                                    <Text key={line} size="xs">
                                        {line}
                                    </Text>
                                ))}
                            </Stack>
                        }
                    >
                        <ActionIcon size="xs" aria-label="Why this is limited">
                            <MantineIcon
                                icon={IconInfoCircle}
                                color="dimmed"
                                aria-hidden
                            />
                        </ActionIcon>
                    </Tooltip>
                )}
            </Group>
            <VisuallyHidden id={descriptionId}>
                {[
                    ...(warning && !blockedEverywhere ? [warning] : []),
                    ...(showRestrictions ? restrictions : []),
                ].join(' ')}
            </VisuallyHidden>
            {warning && !blockedEverywhere && (
                <Text size="xs" c="orange" mt="xxs" ml="xxl" aria-hidden>
                    {warning}
                </Text>
            )}
        </Box>
    );
};
