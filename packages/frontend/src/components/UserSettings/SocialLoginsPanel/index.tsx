import { OpenIdIdentitySummary } from '@lightdash/common';
import { ActionIcon, Card, Group, Stack, Text } from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import { FC } from 'react';
import {
    useDeleteOpenIdentityMutation,
    useOpenIdentities,
} from '../../../hooks/user/useOpenIdentity';
import MantineIcon from '../../common/MantineIcon';
import { ThirdPartySignInButton } from '../../common/ThirdPartySignInButton';

const SocialLoginsPanel: FC = () => {
    const { data: userSocialLogins } = useOpenIdentities();

    const deleteMutation = useDeleteOpenIdentityMutation();

    return (
        <Stack spacing="md">
            {Object.entries(userSocialLogins ?? {}).map(
                ([issuerType, logins]) => (
                    <Stack key={issuerType} spacing="xs">
                        <Text tt="capitalize" fw={600}>
                            {issuerType}
                        </Text>
                        {logins.map((login) => (
                            <Card key={login.email} withBorder padding="xs">
                                <Group position="apart">
                                    {login.email}
                                    <ActionIcon
                                        size="xs"
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
                                </Group>
                            </Card>
                        ))}
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
