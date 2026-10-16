import {
    OrganizationMemberRoleLabels,
    type Group as OrganizationGroup,
    type AgentCapability,
} from '@lightdash/common';
import { Stack, Text } from '@mantine/core';
import { Trans, useTranslation } from 'react-i18next';
import Callout from '../../components/common/Callout';
import MantineModal from '../../components/common/MantineModal';
import i18n from '../../i18n/i18n';
import { agentPageCapabilityLabels } from './agentCapabilityLabels';
import { type AgentPermissionChanges } from './agentPermissionDraft';
import { agentGroupName } from './agentPermissionLabels';

const names = (caps: AgentCapability[]) =>
    caps
        .map((cap) => agentPageCapabilityLabels[cap].label)
        .join(i18n.t('listJoiner', { ns: 'aiAccess' }));
export const AgentPermissionsReviewModal = ({
    changes,
    groups,
    saving,
    disabled,
    error,
    onClose,
    onSave,
}: {
    changes: AgentPermissionChanges;
    groups: OrganizationGroup[];
    saving: boolean;
    disabled: boolean;
    error: string | null;
    onClose: () => void;
    onSave: () => void;
}) => {
    const { t } = useTranslation('aiAccess');
    return (
        <MantineModal
            opened
            title={t('reviewModal.title')}
            onClose={onClose}
            cancelLabel={t('actions.back', { ns: 'common' })}
            confirmLabel={t('reviewModal.saveChanges')}
            confirmLoading={saving}
            confirmDisabled={disabled}
            cancelDisabled={saving}
            onConfirm={onSave}
        >
            <Stack gap="lg">
                {error && <Callout variant="danger">{error}</Callout>}
                {changes.turnedOff ? (
                    <Stack gap="xs">
                        <Text size="xs" c="red" fw={500}>
                            {t('reviewModal.stops')}
                        </Text>
                        <Text fw={500}>{t('reviewModal.turnedOffTitle')}</Text>
                        <Text size="sm">
                            {t('reviewModal.turnedOffDescription')}
                        </Text>
                    </Stack>
                ) : (
                    changes.stops.length > 0 && (
                        <Stack gap="xs">
                            <Text size="xs" c="red" fw={500}>
                                {t('reviewModal.stops')}
                            </Text>
                            <Text>
                                <Trans
                                    t={t}
                                    i18nKey="reviewModal.stopsForAgents"
                                    values={{ names: names(changes.stops) }}
                                    components={{
                                        strong: <Text span fw={500} />,
                                    }}
                                />
                            </Text>
                            <Text size="sm">
                                {t('reviewModal.stopsDescription')}
                            </Text>
                        </Stack>
                    )
                )}
                {changes.allows.length > 0 && (
                    <Stack gap="xs">
                        <Text size="xs" fw={500}>
                            {t('reviewModal.allows')}
                        </Text>
                        <Text fw={500}>{names(changes.allows)}</Text>
                        <Text size="sm">
                            {t('reviewModal.allowsDescription')}
                        </Text>
                    </Stack>
                )}
                {!changes.turnedOff &&
                    changes.roles.map((row) => (
                        <Stack gap="xs" key={row.role}>
                            <Text fw={500}>
                                {OrganizationMemberRoleLabels[row.role]}
                            </Text>
                            {row.stops.length > 0 && (
                                <Text>
                                    {t('reviewModal.roleStops', {
                                        names: names(row.stops),
                                    })}
                                </Text>
                            )}
                            {row.allows.length > 0 && (
                                <Text>
                                    {t('reviewModal.roleAllows', {
                                        names: names(row.allows),
                                    })}
                                </Text>
                            )}
                            <Text size="sm">
                                {t('reviewModal.roleDescription')}
                            </Text>
                        </Stack>
                    ))}
                {changes.groups && (
                    <Stack gap="xs">
                        <Text size="xs" c="blue" fw={500}>
                            {t('reviewModal.who')}
                        </Text>
                        {changes.groups.allowedGroupUuids === null ? (
                            <Text>{t('reviewModal.everyoneCanUse')}</Text>
                        ) : (
                            <>
                                <Text>
                                    <Trans
                                        t={t}
                                        i18nKey="reviewModal.onlyMembersCanUse"
                                        values={{
                                            groups: changes.groups.allowedGroupUuids
                                                .map((uuid) =>
                                                    agentGroupName(
                                                        uuid,
                                                        groups,
                                                    ),
                                                )
                                                .join(t('listJoiner')),
                                        }}
                                        components={{
                                            strong: <Text span fw={500} />,
                                        }}
                                    />
                                </Text>
                                <Text size="sm">
                                    {t('reviewModal.othersLoseAccess')}
                                </Text>
                            </>
                        )}
                    </Stack>
                )}
                {changes.mode !== null && (
                    <Text size="sm">
                        {changes.mode === 'legacy'
                            ? t('reviewModal.modeLegacy')
                            : t('reviewModal.modeLimits')}
                    </Text>
                )}
                <Callout variant="info">{t('reviewModal.footnote')}</Callout>
            </Stack>
        </MantineModal>
    );
};
