import {
    assertUnreachable,
    OpenIdIdentityIssuerType,
    type HealthState,
    type OpenIdIdentitySummary,
} from '@lightdash/common';
import {
    ActionIcon,
    Divider,
    Group,
    Stack,
    Text,
    Title,
    Tooltip,
} from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import { Fragment, useEffect, type FC } from 'react';
import { type Entries } from 'type-fest';
import useHealth from '../../../hooks/health/useHealth';
import useToaster from '../../../hooks/toaster/useToaster';
import { useFlashMessages } from '../../../hooks/useFlashMessages';
import {
    useDeleteOpenIdentityMutation,
    useOpenIdentities,
} from '../../../hooks/user/useOpenIdentity';
import MantineIcon from '../../common/MantineIcon';
import { ThirdPartySignInButton } from '../../common/ThirdPartySignInButton';

const isIssuerTypeAvailable = (
    health: HealthState,
    issuerType: OpenIdIdentitySummary['issuerType'],
) => {
    switch (issuerType) {
        case OpenIdIdentityIssuerType.GOOGLE:
            return health.auth.google.enabled;
        case OpenIdIdentityIssuerType.OKTA:
            return health.auth.okta.enabled;
        case OpenIdIdentityIssuerType.ONELOGIN:
            return health.auth.oneLogin.enabled;
        case OpenIdIdentityIssuerType.AZUREAD:
            return health.auth.azuread.enabled;
        case OpenIdIdentityIssuerType.GENERIC_OIDC:
            return health.auth.oidc.enabled;
        case OpenIdIdentityIssuerType.SNOWFLAKE:
            return health.auth.snowflake.enabled;
        case OpenIdIdentityIssuerType.DATABRICKS:
            return health.auth.databricks?.enabled ?? false;
        case OpenIdIdentityIssuerType.SLACK:
            return false;
        default:
            return assertUnreachable(
                issuerType,
                'Unexpected issuer type when getting social logins',
            );
    }
};

const SocialLoginsPanel: FC = () => {
    const { data: health } = useHealth();
    const { data: userSocialLogins } = useOpenIdentities();
    const deleteMutation = useDeleteOpenIdentityMutation();
    const { showToastError } = useToaster();
    const flashMessages = useFlashMessages();

    useEffect(() => {
        if (flashMessages.data?.error) {
            showToastError({
                title: 'Failed to authenticate',
                subtitle: flashMessages.data.error.join('\n'),
            });
        }
    }, [flashMessages.data, showToastError]);

    if (!health) return null;

    return (
        <Stack gap="md">
            {(
                Object.entries(userSocialLogins ?? {}) as Entries<
                    typeof userSocialLogins
                >
            )
                .filter(([issuerType]) =>
                    isIssuerTypeAvailable(health, issuerType),
                )
                .map(([issuerType, logins], index) => (
                    <Fragment key={issuerType}>
                        {index > 0 && <Divider />}
                        <Stack gap="xs">
                            <Title order={6} tt="capitalize">
                                {issuerType}
                            </Title>
                            {logins.map((login) => (
                                <Group
                                    key={login.email}
                                    justify="space-between"
                                    wrap="nowrap"
                                >
                                    <Text fz="xs" c="dimmed">
                                        {login.email}
                                    </Text>
                                    <Tooltip label="Remove sign-in">
                                        <ActionIcon
                                            size="xs"
                                            aria-label={`Remove ${login.email}`}
                                            disabled={deleteMutation.isLoading}
                                            onClick={() =>
                                                deleteMutation.mutate({
                                                    email: login.email,
                                                    issuer: login.issuer,
                                                })
                                            }
                                        >
                                            <MantineIcon icon={IconTrash} />
                                        </ActionIcon>
                                    </Tooltip>
                                </Group>
                            ))}
                            <Group justify="flex-start" gap="xs">
                                <ThirdPartySignInButton
                                    size="xs"
                                    providerName={issuerType}
                                    intent="add"
                                />
                            </Group>
                        </Stack>
                    </Fragment>
                ))}
        </Stack>
    );
};

export default SocialLoginsPanel;
