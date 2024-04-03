import {
    assertUnreachable,
    OpenIdIdentityIssuerType,
    type HealthState,
    type OpenIdIdentitySummary,
} from '@lightdash/common';
import { ActionIcon, Card, Group, Stack, Text } from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import { useEffect, type FC } from 'react';
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
        <Stack spacing="md">
            {(
                Object.entries(userSocialLogins ?? {}) as Entries<
                    typeof userSocialLogins
                >
            ).map(
                ([issuerType, logins]) =>
                    isIssuerTypeAvailable(health, issuerType) && (
                        <Stack key={issuerType} spacing="xs">
                            <Text tt="capitalize" fw={600}>
                                {issuerType}
                            </Text>
                            {logins.length
                                ? logins.map((login) => (
                                      <Card
                                          key={login.email}
                                          withBorder
                                          padding="xs"
                                      >
                                          <Group position="apart">
                                              {login.email}
                                              <ActionIcon
                                                  size="xs"
                                                  disabled={
                                                      deleteMutation.isLoading
                                                  }
                                                  onClick={() =>
                                                      deleteMutation.mutate({
                                                          email: login.email,
                                                          issuer: login.issuer,
                                                      })
                                                  }
                                              >
                                                  <MantineIcon
                                                      icon={IconTrash}
                                                  />
                                              </ActionIcon>
                                          </Group>
                                      </Card>
                                  ))
                                : null}
                            <Group position="left" spacing="xs">
                                <ThirdPartySignInButton
                                    size="xs"
                                    providerName={issuerType}
                                    intent="add"
                                />
                            </Group>
                        </Stack>
                    ),
            )}
        </Stack>
    );
};

export default SocialLoginsPanel;
