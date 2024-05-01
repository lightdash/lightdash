import { Alert, Anchor, Group, Stack, Switch, Text } from '@mantine/core';
import { IconExclamationCircle } from '@tabler/icons-react';
import { type FC } from 'react';
import { Controller } from 'react-hook-form';
import { useApp } from '../../../providers/AppProvider';
import MantineIcon from '../../common/MantineIcon';

const DbtNoneForm: FC<{ disabled: boolean }> = ({ disabled }) => {
    const { health } = useApp();
    return (
        <Stack>
            <Alert
                color="orange"
                icon={<MantineIcon icon={IconExclamationCircle} size="lg" />}
            >
                <Text color="orange">
                    This project was created from the CLI. If you want to keep{' '}
                    {`${health.data?.siteName}`} in sync with your dbt project,
                    you need to either{' '}
                    <Anchor
                        href={`${health.data?.siteHelpdeskUrl}/get-started/setup-lightdash/connect-project#2-import-a-dbt-project`}
                        target="_blank"
                        rel="noreferrer"
                    >
                        change your connection type
                    </Anchor>
                    , setup a{' '}
                    <Anchor
                        href={`${health.data?.siteHelpdeskUrl}/guides/cli/how-to-use-lightdash-deploy#automatically-deploy-your-changes-to-lightdash-using-a-github-action`}
                        target="_blank"
                        rel="noreferrer"
                    >
                        GitHub action
                    </Anchor>{' '}
                    or, run{' '}
                    <Anchor
                        href={`${health.data?.siteHelpdeskUrl}/guides/cli/how-to-use-lightdash-deploy#lightdash-deploy-syncs-the-changes-in-your-dbt-project-to-lightdash`}
                        target="_blank"
                        rel="noreferrer"
                    >
                        lightdash deploy
                    </Anchor>{' '}
                    from your command line.
                </Text>
            </Alert>

            <Controller
                name="dbt.hideRefreshButton"
                render={({ field }) => (
                    <Switch.Group
                        label="Hide refresh dbt button in the app"
                        description={
                            <p>
                                This will hide the refresh dbt button from the
                                explore page. Read more about your{' '}
                                <Anchor
                                    href={`${health.data?.siteHelpdeskUrl}/references/syncing_your_dbt_changes#2-in-the-ui-syncing-your-dbt-changes-using-refresh-dbt`}
                                    target="_blank"
                                    rel="noreferrer"
                                >
                                    options for refreshing dbt here
                                </Anchor>
                            </p>
                        }
                        value={field.value ? ['true'] : []}
                        onChange={(values) => field.onChange(values.length > 0)}
                        size="md"
                    >
                        <Group mt="xs">
                            <Switch
                                onLabel="Yes"
                                offLabel="No"
                                value="true"
                                disabled={disabled}
                            />
                        </Group>
                    </Switch.Group>
                )}
            />
        </Stack>
    );
};

export default DbtNoneForm;
