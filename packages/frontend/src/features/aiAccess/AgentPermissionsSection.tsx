import {
    type AgentCapabilityPolicyOverview,
    type ApiAiOrganizationSettingsResponse,
    type Group as OrganizationGroup,
} from '@lightdash/common';
import { Anchor, Button, Group, Stack, Text, Title } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import Callout from '../../components/common/Callout';
import { SettingsCard } from '../../components/common/Settings/SettingsCard';
import { AgentCapabilityChoices } from './AgentCapabilityChoices';
import { AgentCapabilitySwitches } from './AgentCapabilitySwitches';
import { AgentGroupAdmissionSection } from './AgentGroupAdmissionSection';
import { AgentMcpAccessSwitch } from './AgentMcpAccessSwitch';
import {
    chooseAgentPermission,
    getAgentPermissionChoice,
} from './agentPermissionDraft';
import { AgentPermissionsReviewModal } from './AgentPermissionsReviewModal';
import classes from './AgentPermissionsSection.module.css';
import { type useAgentCapabilityPolicy } from './api';
import { useAgentPermissionsForm } from './useAgentPermissionsForm';

export const AgentPermissionsSection = ({
    policy,
    groups,
    refetchPolicy,
    loadError,
    mcpSettings,
}: {
    policy: AgentCapabilityPolicyOverview;
    groups: OrganizationGroup[];
    refetchPolicy: ReturnType<typeof useAgentCapabilityPolicy>['refetch'];
    loadError: boolean;
    mcpSettings: ApiAiOrganizationSettingsResponse['results'] | null;
}) => {
    const { t } = useTranslation('aiAccess');
    const {
        baseline,
        form,
        choice,
        setChoice,
        reviewOpened,
        setReviewOpened,
        changes,
        count,
        accept,
        saving,
        conflict,
        disabled,
        invalidGroups,
        saveDisabled,
        saveError,
        reload,
        submit,
    } = useAgentPermissionsForm({ policy, refetchPolicy, loadError });
    return (
        <SettingsCard>
            <Stack gap="lg">
                <Stack gap="xs">
                    <Title order={5}>{t('permissionsSection.title')}</Title>
                    <Text size="sm" c="dimmed">
                        {t('permissionsSection.description')}
                    </Text>
                </Stack>
                {conflict && (
                    <Callout
                        variant="warning"
                        title={t('permissionsSection.conflictTitle')}
                    >
                        <Stack gap="sm">
                            <Text size="sm">
                                {t('permissionsSection.conflictDescription')}
                            </Text>
                            <Button
                                variant="default"
                                disabled={saving}
                                onClick={() => void reload()}
                            >
                                {t('permissionsSection.reloadLatest')}
                            </Button>
                        </Stack>
                    </Callout>
                )}
                <Stack gap="sm">
                    <Title order={5}>{t('capabilityChoices.ariaLabel')}</Title>
                    <AgentCapabilityChoices
                        choice={choice}
                        current={getAgentPermissionChoice(baseline)}
                        disabled={disabled}
                        onChange={(value) => {
                            setChoice(value);
                            form.setValues(
                                choice === value
                                    ? form.values
                                    : chooseAgentPermission(
                                          form.values,
                                          value,
                                          baseline,
                                      ),
                            );
                        }}
                    >
                        <AgentCapabilitySwitches
                            draft={form.values}
                            onChange={form.setValues}
                            disabled={disabled}
                        />
                    </AgentCapabilityChoices>
                </Stack>
                <AgentGroupAdmissionSection
                    available={policy.groupsAvailable}
                    groups={groups}
                    selection={form.values.allowedGroupUuids}
                    savedSelection={baseline.allowedGroupUuids}
                    onChange={(value) =>
                        form.setFieldValue('allowedGroupUuids', value)
                    }
                    disabled={disabled || loadError}
                    invalid={invalidGroups}
                />
                {mcpSettings && (
                    <AgentMcpAccessSwitch
                        settings={mcpSettings}
                        setting="mcpAgentsEnabled"
                        label={t('permissionsSection.mcpLabel')}
                        description={t('permissionsSection.mcpDescription')}
                    />
                )}
                <Stack gap="md" className={classes.footer}>
                    <Text size="sm" c="dimmed">
                        {t('permissionsSection.patNote')}{' '}
                        <Anchor
                            href="https://docs.lightdash.com/references/personal_tokens"
                            target="_blank"
                            rel="noreferrer"
                            size="sm"
                        >
                            {t('learnMore')}
                        </Anchor>
                    </Text>
                    <Group justify="flex-end">
                        <Text size="sm" c="dimmed" role="status">
                            {count === 0
                                ? t('permissionsSection.noChanges')
                                : t('permissionsSection.unsavedChanges', {
                                      count,
                                  })}
                        </Text>
                        {count > 0 && (
                            <Button
                                variant="subtle"
                                disabled={saving}
                                onClick={() => accept(policy)}
                            >
                                {t('permissionsSection.discard')}
                            </Button>
                        )}
                        <Button
                            disabled={saveDisabled}
                            onClick={() => setReviewOpened(true)}
                        >
                            {t('permissionsSection.reviewAndSave')}
                        </Button>
                    </Group>
                </Stack>
                {reviewOpened && !conflict && (
                    <AgentPermissionsReviewModal
                        changes={changes}
                        groups={groups}
                        saving={saving}
                        disabled={saveDisabled}
                        error={saveError}
                        onClose={() => {
                            if (!saving) setReviewOpened(false);
                        }}
                        onSave={submit}
                    />
                )}
            </Stack>
        </SettingsCard>
    );
};
