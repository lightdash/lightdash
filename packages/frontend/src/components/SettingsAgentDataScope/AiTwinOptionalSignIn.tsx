import { Accordion, Stack } from '@mantine/core';
import { IntegrationStep } from './IntegrationStep';
import { SignInStep } from './SignInStep';
import type { useBoundaryGuide } from './useBoundaryGuide';

export const AiTwinOptionalSignIn = ({
    guide,
}: {
    guide: ReturnType<typeof useBoundaryGuide>;
}) => (
    <Accordion>
        <Accordion.Item value="sign-in">
            <Accordion.Control>
                Snowflake sign-in for AI (optional)
            </Accordion.Control>
            <Accordion.Panel>
                <Stack gap="sm">
                    <IntegrationStep
                        integrationName={guide.integrationName}
                        setIntegrationName={guide.setIntegrationName}
                        roles={guide.roles}
                        setRoles={guide.setRoles}
                        sql={guide.integrationSql}
                        cloud={guide.config.data?.cloud ?? false}
                        account={guide.account}
                        setAccount={guide.setAccount}
                        envBlock={guide.envBlock}
                        enabled={
                            guide.health?.auth.snowflakeAi.enabled === true
                        }
                    />
                    <SignInStep
                        signedIn={guide.signedIn}
                        loading={guide.login.isLoading}
                        onSignIn={() =>
                            guide.login.mutate(undefined, {
                                onSuccess: () => void guide.config.refetch(),
                            })
                        }
                    />
                </Stack>
            </Accordion.Panel>
        </Accordion.Item>
    </Accordion>
);
