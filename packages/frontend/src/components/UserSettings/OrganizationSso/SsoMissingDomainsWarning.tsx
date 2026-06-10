import { Button, Group, Stack, Text, Tooltip } from '@mantine-8/core';
import { IconArrowRight } from '@tabler/icons-react';
import { type FC } from 'react';
import { Link } from 'react-router';
import { useVerifiedDomains } from '../../../hooks/organization/useOrganizationDomainVerification';
import Callout from '../../common/Callout';
import MantineIcon from '../../common/MantineIcon';

type Props = {
    providerLabel: string;
};

const SsoMissingDomainsWarning: FC<Props> = ({ providerLabel }) => {
    const { data: verifiedDomains, isInitialLoading } = useVerifiedDomains();
    const hasNoVerifiedDomains =
        !isInitialLoading && (verifiedDomains ?? []).length === 0;

    if (!hasNoVerifiedDomains) return null;

    return (
        <Callout variant="warning" title={`${providerLabel} is not active yet`}>
            <Group justify="space-between" align="center" gap="md">
                <Stack gap={2}>
                    <Text size="sm">
                        Users cannot sign in with {providerLabel} until this
                        organization has a verified email domain.
                    </Text>
                    <Text size="xs" c="dimmed">
                        Verify a domain first, then users with matching email
                        addresses can be routed to this provider.
                    </Text>
                </Stack>
                <Tooltip
                    label="SSO routing is based on verified email domains."
                    withArrow
                    multiline
                    maw={260}
                >
                    <Button
                        component={Link}
                        to="/generalSettings/verifiedDomains"
                        variant="default"
                        rightSection={<MantineIcon icon={IconArrowRight} />}
                    >
                        Add verified domain
                    </Button>
                </Tooltip>
            </Group>
        </Callout>
    );
};

export default SsoMissingDomainsWarning;
