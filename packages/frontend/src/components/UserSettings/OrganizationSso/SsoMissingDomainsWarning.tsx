import { Button, Group, Stack, Text, Tooltip } from '@mantine/core';
import { IconArrowRight } from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useVerifiedDomains } from '../../../hooks/organization/useOrganizationDomainVerification';
import Callout from '../../common/Callout';
import MantineIcon from '../../common/MantineIcon';

type Props = {
    providerLabel: string;
};

const SsoMissingDomainsWarning: FC<Props> = ({ providerLabel }) => {
    const { t } = useTranslation('userSettings');
    const { data: verifiedDomains, isInitialLoading } = useVerifiedDomains();
    const hasNoVerifiedDomains =
        !isInitialLoading && (verifiedDomains ?? []).length === 0;

    if (!hasNoVerifiedDomains) return null;

    return (
        <Callout
            variant="warning"
            title={t('organizationSso.missingDomainsWarning.title', {
                provider: providerLabel,
            })}
        >
            <Group justify="space-between" align="center" gap="md">
                <Stack gap={2}>
                    <Text size="sm">
                        {t('organizationSso.missingDomainsWarning.body', {
                            provider: providerLabel,
                        })}
                    </Text>
                    <Text size="xs" c="dimmed">
                        {t('organizationSso.missingDomainsWarning.hint')}
                    </Text>
                </Stack>
                <Tooltip
                    label={t('organizationSso.missingDomainsWarning.tooltip')}
                    maw={260}
                >
                    <Button
                        component={Link}
                        to="/generalSettings/verifiedDomains"
                        variant="default"
                        rightSection={<MantineIcon icon={IconArrowRight} />}
                    >
                        {t(
                            'organizationSso.missingDomainsWarning.addVerifiedDomain',
                        )}
                    </Button>
                </Tooltip>
            </Group>
        </Callout>
    );
};

export default SsoMissingDomainsWarning;
