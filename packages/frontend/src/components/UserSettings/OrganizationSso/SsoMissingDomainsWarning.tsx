import { Button, Group, Text } from '@mantine/core';
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
                <Text fz="sm">
                    Users cannot sign in with {providerLabel} until this
                    organization has a verified email domain. Verify a domain
                    first, then users with matching email addresses can be
                    routed to this provider.
                </Text>
                <Button
                    component={Link}
                    to="/generalSettings/verifiedDomains"
                    variant="default"
                    size="xs"
                    rightSection={<MantineIcon icon={IconArrowRight} />}
                >
                    Add verified domain
                </Button>
            </Group>
        </Callout>
    );
};

export default SsoMissingDomainsWarning;
