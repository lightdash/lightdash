import { Badge, Button, Divider, Menu, Stack, Text } from '@mantine/core';
import {
    IconCircleCheck,
    IconMail,
    IconPlus,
    IconTrash,
    IconWorld,
    IconWorldCheck,
} from '@tabler/icons-react';
import dayjs from 'dayjs';
import { Fragment, useState, type FC } from 'react';
import {
    useDeleteVerifiedDomain,
    useVerifiedDomains,
} from '../../../hooks/organization/useOrganizationDomainVerification';
import EmptyStateLoader from '../../common/EmptyStateLoader';
import MantineIcon from '../../common/MantineIcon';
import MantineModal from '../../common/MantineModal';
import { SettingRow } from '../../common/Settings/SettingLayout';
import { SettingsCard } from '../../common/Settings/SettingsCard';
import { SettingsEmptyState } from '../../common/Settings/SettingsEmptyState';
import { SettingsPage } from '../../common/Settings/SettingsPage';
import AddVerifiedDomainModal from './AddVerifiedDomainModal';

const VerifiedDomainsPanel: FC = () => {
    const { data: verifiedDomains, isInitialLoading } = useVerifiedDomains();
    const deleteDomain = useDeleteVerifiedDomain();
    const [domainToDelete, setDomainToDelete] = useState<string | null>(null);
    const [addOpen, setAddOpen] = useState(false);

    return (
        <SettingsPage
            title="Verified domains"
            description="Verify domains your organization owns and route them to your SSO providers."
            actions={
                <Menu position="bottom-end">
                    <Menu.Target>
                        <Button
                            size="xs"
                            leftSection={<MantineIcon icon={IconPlus} />}
                        >
                            Add domain
                        </Button>
                    </Menu.Target>
                    <Menu.Dropdown>
                        <Menu.Label>Verify ownership with</Menu.Label>
                        <Menu.Item
                            leftSection={<MantineIcon icon={IconMail} />}
                            onClick={() => setAddOpen(true)}
                        >
                            Email
                        </Menu.Item>
                        <Menu.Item
                            leftSection={<MantineIcon icon={IconWorld} />}
                            disabled
                            rightSection={<Badge size="xs">Soon</Badge>}
                        >
                            DNS (TXT record)
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
                    title="No verified domains"
                    description="Add a domain before routing sign-in to an SSO provider."
                />
            ) : (
                <SettingsCard>
                    <Stack gap="md">
                        {(verifiedDomains ?? []).map((d, index) => (
                            <Fragment key={d.domain}>
                                {index > 0 && <Divider />}
                                <SettingRow
                                    titlePrefix={
                                        <MantineIcon
                                            icon={IconCircleCheck}
                                            color="green"
                                        />
                                    }
                                    title={d.domain}
                                    description={`Verified ${dayjs(d.verifiedAt).format('MMM D, YYYY')}`}
                                    control={
                                        <Button
                                            variant="subtle"
                                            color="red"
                                            size="xs"
                                            leftSection={
                                                <MantineIcon icon={IconTrash} />
                                            }
                                            onClick={() =>
                                                setDomainToDelete(d.domain)
                                            }
                                        >
                                            Remove
                                        </Button>
                                    }
                                />
                            </Fragment>
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
                    title="Remove verified domain"
                    icon={IconWorldCheck}
                    cancelLabel="Cancel"
                    actions={
                        <Button
                            color="red"
                            loading={deleteDomain.isLoading}
                            onClick={async () => {
                                await deleteDomain.mutateAsync(domainToDelete);
                                setDomainToDelete(null);
                            }}
                        >
                            Remove
                        </Button>
                    }
                >
                    <Text>
                        Removing <b>{domainToDelete}</b> will stop routing it to
                        any SSO provider. You can verify it again later.
                    </Text>
                </MantineModal>
            )}
        </SettingsPage>
    );
};

export default VerifiedDomainsPanel;
