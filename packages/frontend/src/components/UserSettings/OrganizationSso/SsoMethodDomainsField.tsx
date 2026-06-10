import { Anchor, Checkbox, MultiSelect, Stack, Text } from '@mantine-8/core';
import { type FC, type ReactNode } from 'react';
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
    <Anchor component={Link} to="/generalSettings/verifiedDomains" size="xs">
        Verified domains
    </Anchor>
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
    const { data: verifiedDomains, isInitialLoading } = useVerifiedDomains();
    const options = (verifiedDomains ?? []).map((d) => d.domain);
    const hasVerifiedDomains = options.length > 0;

    return (
        <Stack gap="xs">
            <Checkbox
                label="Restrict to specific verified domains"
                description={`When off, all of your organization's verified domains route to ${providerLabel}.`}
                checked={override}
                onChange={(event) =>
                    onOverrideChange(event.currentTarget.checked)
                }
            />
            {override ? (
                <MultiSelect
                    label="Verified domains for this method"
                    description={
                        hasVerifiedDomains ? (
                            `Only users whose email domain matches one of these will see ${providerLabel}.`
                        ) : (
                            <Text span size="xs">
                                {providerLabel} cannot be used until you verify
                                a domain in {verifiedDomainsLink}.
                            </Text>
                        )
                    }
                    placeholder={
                        hasVerifiedDomains
                            ? 'Select verified domains'
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
                        <>
                            All of your organization's verified domains route to{' '}
                            {providerLabel}: <b>{options.join(', ')}</b>
                        </>
                    ) : (
                        <Text span size="sm" c="dimmed">
                            {providerLabel} cannot be used yet. Verify a domain
                            in {verifiedDomainsLink} before users can sign in
                            with this provider.
                        </Text>
                    )}
                </Text>
            )}
        </Stack>
    );
};

export default SsoMethodDomainsField;
