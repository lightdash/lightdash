import { Alert, Anchor, Group, Stack, Switch, Text } from '@mantine/core';
import { IconExclamationCircle } from '@tabler/icons-react';
import { type FC } from 'react';
import { Controller } from 'react-hook-form';
import MantineIcon from '../../common/MantineIcon';

const DbtNoneForm: FC<{ disabled: boolean }> = ({ disabled }) => (
    <Stack>
        <Alert
            color="orange"
            icon={<MantineIcon icon={IconExclamationCircle} size="lg" />}
        >
            <Text color="orange">
                This project was created from the CLI. If you want to keep
                Lightdash in sync with your dbt project, you need to either{' '}
                <Anchor
                    href={
                        'https://docs.lightdash.com/get-started/setup-lightdash/connect-project#2-import-a-dbt-project'
                    }
                    target="_blank"
                    rel="noreferrer"
                >
                    change your connection type
                </Anchor>
                , setup a{' '}
                <Anchor
                    href={
                        'https://docs.lightdash.com/guides/cli/how-to-use-lightdash-deploy#automatically-deploy-your-changes-to-lightdash-using-a-github-action'
                    }
                    target="_blank"
                    rel="noreferrer"
                >
                    GitHub action
                </Anchor>{' '}
                or, run{' '}
                <Anchor
                    href={
                        'https://docs.lightdash.com/guides/cli/how-to-use-lightdash-deploy#lightdash-deploy-syncs-the-changes-in-your-dbt-project-to-lightdash'
                    }
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
                                href={
                                    'https://docs.lightdash.com/references/dbt-projects'
                                }
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

export default DbtNoneForm;
