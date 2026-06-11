import {
    Badge,
    Button,
    Group,
    Menu,
    Stack,
    Text,
    Title,
} from '@mantine-8/core';
import {
    IconCircleCheck,
    IconMail,
    IconPlus,
    IconTrash,
    IconWorld,
    IconWorldCheck,
} from '@tabler/icons-react';
import { useState, type FC } from 'react';
import {
    useDeleteVerifiedDomain,
    useVerifiedDomains,
} from '../../../hooks/organization/useOrganizationDomainVerification';
import EmptyStateLoader from '../../common/EmptyStateLoader';
import MantineIcon from '../../common/MantineIcon';
import MantineModal from '../../common/MantineModal';
import { SettingsCard } from '../../common/Settings/SettingsCard';
import AddVerifiedDomainModal from './AddVerifiedDomainModal';

const VerifiedDomainsPanel: FC = () => {
    const { data: verifiedDomains, isInitialLoading } = useVerifiedDomains();
    const deleteDomain = useDeleteVerifiedDomain();
    const [domainToDelete, setDomainToDelete] = useState<string | null>(null);
    const [addOpen, setAddOpen] = useState(false);

    return (
        <SettingsCard p="lg">
            <Stack gap="md">
                <Group gap="sm" wrap="nowrap" align="flex-start">
                    <MantineIcon icon={IconWorldCheck} size="lg" />
                    <Stack gap={2}>
                        <Title order={5}>Verified domains</Title>
                        <Text c="dimmed" size="sm" maw={520}>
                            Verify the domains your organization owns. Verified
                            domains can be routed to your SSO providers.
                        </Text>
                    </Stack>
                </Group>

                {isInitialLoading ? (
                    <EmptyStateLoader mih={60} />
                ) : (
                    <Stack gap="xs">
                        {(verifiedDomains ?? []).length === 0 ? (
                            <Text size="sm" c="dimmed">
                                No verified domains yet.
                            </Text>
                        ) : (
                            (verifiedDomains ?? []).map((d) => (
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
                                        <Badge
                                            color="green"
                                            variant="light"
                                            size="sm"
                                        >
                                            Verified
                                        </Badge>
                                    </Group>
                                    <Button
                                        variant="subtle"
                                        color="red"
                                        size="compact-sm"
                                        leftSection={
                                            <MantineIcon icon={IconTrash} />
                                        }
                                        onClick={() =>
                                            setDomainToDelete(d.domain)
                                        }
                                    >
                                        Remove
                                    </Button>
                                </Group>
                            ))
                        )}
                    </Stack>
                )}

                <Menu position="bottom-start" withinPortal>
                    <Menu.Target>
                        <Button
                            w="fit-content"
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
                            rightSection={
                                <Badge size="xs" variant="light" color="gray">
                                    Soon
                                </Badge>
                            }
                        >
                            DNS (TXT record)
                        </Menu.Item>
                    </Menu.Dropdown>
                </Menu>
            </Stack>

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
        </SettingsCard>
    );
};

export default VerifiedDomainsPanel;
