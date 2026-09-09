import { Alert, Anchor, Stack, Text } from '@mantine/core';
import { IconExclamationCircle } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../common/MantineIcon';
import { useFormContext } from '../formContext';
import BooleanSwitch from '../Inputs/BooleanSwitch';

const DbtNoneForm: FC<{ disabled: boolean }> = ({ disabled }) => {
    const form = useFormContext();
    return (
        <Stack>
            <Alert
                color="orange"
                icon={<MantineIcon icon={IconExclamationCircle} size="lg" />}
            >
                <Text c="orange" fz="sm">
                    This project is deployed using the CLI. To refresh native
                    YAML and edit source files in Lightdash, select GitHub above
                    and choose Native Lightdash YAML. You can also deploy with{' '}
                    <Anchor
                        href="https://docs.lightdash.com/guides/cli/how-to-use-lightdash-deploy"
                        target="_blank"
                        rel="noreferrer"
                        fz="sm"
                    >
                        lightdash deploy
                    </Anchor>{' '}
                    or automate deployments with a GitHub action.
                </Text>
            </Alert>

            <BooleanSwitch
                onLabel="Yes"
                offLabel="No"
                disabled={disabled}
                {...form.getInputProps('dbt.hideRefreshButton')}
                name="dbt.hideRefreshButton"
                label="Hide refresh button in the app"
                description={
                    <Text fz="sm">
                        This will hide the refresh button from the explore page.
                        Read more about your{' '}
                        <Anchor
                            href={
                                'https://docs.lightdash.com/references/dbt-projects'
                            }
                            target="_blank"
                            rel="noreferrer"
                            fz="sm"
                        >
                            options for refreshing dbt here
                        </Anchor>
                    </Text>
                }
            />
        </Stack>
    );
};

export default DbtNoneForm;
