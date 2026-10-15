import { Anchor, Checkbox, MultiSelect, Stack, Text } from '@mantine/core';
import { type FC, type ReactNode } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useVerifiedDomains } from '../../../hooks/organization/useOrganizationDomainVerification';

type Props = {
    providerLabel: string;
    override: boolean;
    onOverrideChange: (override: boolean) => void;
    domains: string[];
    onDomainsChange: (domains: string[]) => void;
    error?: ReactNode;
};

const verifiedDomainsLink = (
    <Anchor component={Link} to="/generalSettings/verifiedDomains" size="xs" />
);

/**
 * Discovery email-domain control for an SSO method. A method only ever routes
 * domains the organization has verified. By default (`override = false`) it
 * routes ALL of the org's verified domains; toggling override restricts it to a
 * selected subset. Verified domains are the single source of truth — the same
 * rule is enforced server-side.
 */
const SsoMethodDomainsField: FC<Props> = ({
    providerLabel,
    override,
    onOverrideChange,
    domains,
    onDomainsChange,
    error,
}) => {
    const { t } = useTranslation('userSettings');
    const { data: verifiedDomains, isInitialLoading } = useVerifiedDomains();
    const options = (verifiedDomains ?? []).map((d) => d.domain);
    const hasVerifiedDomains = options.length > 0;

    return (
        <Stack gap="xs">
            <Checkbox
                label={t('organizationSso.domainsField.restrict')}
                description={t(
                    'organizationSso.domainsField.restrictDescription',
                    {
                        provider: providerLabel,
                    },
                )}
                checked={override}
                onChange={(event) =>
                    onOverrideChange(event.currentTarget.checked)
                }
            />
            {override ? (
                <MultiSelect
                    label={t('organizationSso.domainsField.selectLabel')}
                    description={
                        hasVerifiedDomains ? (
                            t(
                                'organizationSso.domainsField.selectDescription',
                                {
                                    provider: providerLabel,
                                },
                            )
                        ) : (
                            <Text span size="xs">
                                <Trans
                                    t={t}
                                    i18nKey="organizationSso.domainsField.cannotBeUsed"
                                    values={{ provider: providerLabel }}
                                    components={{ link: verifiedDomainsLink }}
                                />
                            </Text>
                        )
                    }
                    placeholder={
                        hasVerifiedDomains
                            ? t(
                                  'organizationSso.domainsField.selectPlaceholder',
                              )
                            : undefined
                    }
                    data={options}
                    value={domains}
                    onChange={onDomainsChange}
                    error={error}
                    disabled={!hasVerifiedDomains || isInitialLoading}
                    clearable
                />
            ) : (
                <Text size="sm" c="dimmed">
                    {hasVerifiedDomains ? (
                        <Trans
                            t={t}
                            i18nKey="organizationSso.domainsField.allDomainsRoute"
                            values={{
                                provider: providerLabel,
                                domains: options.join(', '),
                            }}
                            components={{ b: <b /> }}
                        />
                    ) : (
                        <Text span size="sm" c="dimmed">
                            <Trans
                                t={t}
                                i18nKey="organizationSso.domainsField.cannotBeUsedYet"
                                values={{ provider: providerLabel }}
                                components={{ link: verifiedDomainsLink }}
                            />
                        </Text>
                    )}
                </Text>
            )}
        </Stack>
    );
};

export default SsoMethodDomainsField;
