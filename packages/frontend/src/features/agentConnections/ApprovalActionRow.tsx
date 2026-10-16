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
import { useTranslation } from 'react-i18next';
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
    const { t } = useTranslation('aiAccess');
    const descriptionId = useId();
    const reasons = [
        ...new Set(action.blocked.map(({ reason }) => reason).filter(Boolean)),
    ];
    const blockedEverywhere = action.offered === 0;
    const mixed = action.offered > 0 && action.offered < projectCount;
    const warning =
        action.capability === AgentCapability.Delete
            ? t('agentConnections.actionRow.deleteWarning')
            : action.capability === AgentCapability.Publish
              ? t('agentConnections.actionRow.publishWarning')
              : null;
    const restrictions = [
        ...(mixed
            ? [
                  t('agentConnections.actionRow.availableIn', {
                      offered: action.offered,
                      count: projectCount,
                  }),
              ]
            : []),
        ...(blockedEverywhere && reasons.length === 1
            ? reasons
            : action.blocked.map((blocked) =>
                  t('agentConnections.actionRow.blockedReason', {
                      name: blocked.name,
                      reason: blocked.reason,
                  }),
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
                        <ActionIcon
                            size="xs"
                            aria-label={t(
                                'agentConnections.actionRow.whyLimited',
                            )}
                        >
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
