import { Alert, Anchor, Stack, Text } from '@mantine/core';
import { IconExclamationCircle } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../common/MantineIcon';

const DbtManifestForm: FC<{}> = ({}) => {
    return (
        <Stack>
            <Alert
                color="orange"
                icon={<MantineIcon icon={IconExclamationCircle} size="lg" />}
            >
                <Text color="orange">
                    This project was created from a manifest.json file. If you
                    want to keep Lightdash in sync with your dbt project, you
                    need to either{' '}
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
        </Stack>
    );
};

export default DbtManifestForm;
