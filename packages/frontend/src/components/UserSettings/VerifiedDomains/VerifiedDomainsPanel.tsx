import { Badge, Button, Group, Menu, Stack, Text } from '@mantine/core';
import {
    IconCircleCheck,
    IconMail,
    IconPlus,
    IconTrash,
    IconWorld,
    IconWorldCheck,
} from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import {
    useDeleteVerifiedDomain,
    useVerifiedDomains,
} from '../../../hooks/organization/useOrganizationDomainVerification';
import EmptyStateLoader from '../../common/EmptyStateLoader';
import MantineIcon from '../../common/MantineIcon';
import MantineModal from '../../common/MantineModal';
import { SettingsCard } from '../../common/Settings/SettingsCard';
import { SettingsEmptyState } from '../../common/Settings/SettingsEmptyState';
import { SettingsPage } from '../../common/Settings/SettingsPage';
import AddVerifiedDomainModal from './AddVerifiedDomainModal';

const VerifiedDomainsPanel: FC = () => {
    const { t } = useTranslation('userSettings');
    const { data: verifiedDomains, isInitialLoading } = useVerifiedDomains();
    const deleteDomain = useDeleteVerifiedDomain();
    const [domainToDelete, setDomainToDelete] = useState<string | null>(null);
    const [addOpen, setAddOpen] = useState(false);

    return (
        <SettingsPage
            title={t('verifiedDomains.panel.title')}
            description={t('verifiedDomains.panel.description')}
            actions={
                <Menu position="bottom-end">
                    <Menu.Target>
                        <Button
                            size="xs"
                            leftSection={<MantineIcon icon={IconPlus} />}
                        >
                            {t('verifiedDomains.panel.addDomain')}
                        </Button>
                    </Menu.Target>
                    <Menu.Dropdown>
                        <Menu.Label>
                            {t('verifiedDomains.panel.verifyOwnershipWith')}
                        </Menu.Label>
                        <Menu.Item
                            leftSection={<MantineIcon icon={IconMail} />}
                            onClick={() => setAddOpen(true)}
                        >
                            {t('verifiedDomains.panel.email')}
                        </Menu.Item>
                        <Menu.Item
                            leftSection={<MantineIcon icon={IconWorld} />}
                            disabled
                            rightSection={
                                <Badge size="xs">
                                    {t('verifiedDomains.panel.soon')}
                                </Badge>
                            }
                        >
                            {t('verifiedDomains.panel.dns')}
                        </Menu.Item>
                    </Menu.Dropdown>
                </Menu>
            }
        >
            {isInitialLoading ? (
                <SettingsCard>
                    <EmptyStateLoader mih={60} />
                </SettingsCard>
            ) : (verifiedDomains ?? []).length === 0 ? (
                <SettingsEmptyState
                    icon={IconWorldCheck}
                    title={t('verifiedDomains.panel.emptyTitle')}
                    description={t('verifiedDomains.panel.emptyDescription')}
                />
            ) : (
                <SettingsCard>
                    <Stack gap="xs">
                        {(verifiedDomains ?? []).map((d) => (
                            <Group
                                key={d.domain}
                                justify="space-between"
                                wrap="nowrap"
                            >
                                <Group gap="xs" wrap="nowrap">
                                    <MantineIcon
                                        icon={IconCircleCheck}
                                        color="green"
                                    />
                                    <Text fw={500}>{d.domain}</Text>
                                    <Badge color="green" size="sm">
                                        {t('verifiedDomains.panel.verified')}
                                    </Badge>
                                </Group>
                                <Button
                                    variant="subtle"
                                    color="red"
                                    size="compact-sm"
                                    leftSection={
                                        <MantineIcon icon={IconTrash} />
                                    }
                                    onClick={() => setDomainToDelete(d.domain)}
                                >
                                    {t('actions.remove', { ns: 'common' })}
                                </Button>
                            </Group>
                        ))}
                    </Stack>
                </SettingsCard>
            )}

            {addOpen && (
                <AddVerifiedDomainModal
                    opened
                    onClose={() => setAddOpen(false)}
                />
            )}

            {domainToDelete && (
                <MantineModal
                    opened
                    onClose={() => setDomainToDelete(null)}
                    role="alertdialog"
                    title={t('verifiedDomains.panel.removeModalTitle')}
                    icon={IconWorldCheck}
                    cancelLabel={t('actions.cancel', { ns: 'common' })}
                    actions={
                        <Button
                            color="red"
                            loading={deleteDomain.isLoading}
                            onClick={async () => {
                                await deleteDomain.mutateAsync(domainToDelete);
                                setDomainToDelete(null);
                            }}
                        >
                            {t('actions.remove', { ns: 'common' })}
                        </Button>
                    }
                >
                    <Text>
                        <Trans
                            t={t}
                            i18nKey="verifiedDomains.panel.removeModalBody"
                            values={{ domain: domainToDelete }}
                            components={{ b: <b /> }}
                        />
                    </Text>
                </MantineModal>
            )}
        </SettingsPage>
    );
};

export default VerifiedDomainsPanel;
