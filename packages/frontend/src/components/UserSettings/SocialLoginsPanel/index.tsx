import {
    HealthState,
    OpenIdIdentityIssuerType,
    OpenIdIdentitySummary,
} from '@lightdash/common';
import { ActionIcon, Card, Group, Stack, Text } from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import { FC } from 'react';
import { Entries } from 'type-fest';
import useHealth from '../../../hooks/health/useHealth';
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
            return !!health.auth.google.oauth2ClientId;
        case OpenIdIdentityIssuerType.OKTA:
            return health.auth.okta.enabled;
        case OpenIdIdentityIssuerType.ONELOGIN:
            return health.auth.oneLogin.enabled;
        default:
            return false;
    }
};

const SocialLoginsPanel: FC = () => {
    const { data: health } = useHealth();
    const { data: userSocialLogins } = useOpenIdentities();

    const deleteMutation = useDeleteOpenIdentityMutation();

    return (
        <Stack spacing="md">
            {health &&
                (
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
                                                          deleteMutation.mutate(
                                                              {
                                                                  email: login.email,
                                                                  issuer: login.issuer,
                                                              },
                                                          )
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
                                        providerName={
                                            issuerType as OpenIdIdentitySummary['issuerType']
                                        }
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
