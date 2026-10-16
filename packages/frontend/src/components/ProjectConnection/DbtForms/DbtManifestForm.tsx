import { Alert, Anchor, Stack, Text } from '@mantine/core';
import { IconExclamationCircle } from '@tabler/icons-react';
import { type FC } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import MantineIcon from '../../common/MantineIcon';

const DbtManifestForm: FC = () => {
    const { t } = useTranslation('projectConnection');
    return (
        <Stack>
            <Alert
                color="orange"
                icon={<MantineIcon icon={IconExclamationCircle} />}
            >
                <Text>
                    <Trans
                        t={t}
                        i18nKey="dbtForms.manifest.description"
                        components={{
                            connectionTypeLink: (
                                <Anchor
                                    href="https://docs.lightdash.com/get-started/setup-lightdash/connect-project#2-import-a-dbt-project"
                                    target="_blank"
                                    rel="noreferrer"
                                />
                            ),
                            githubActionLink: (
                                <Anchor
                                    href="https://docs.lightdash.com/guides/cli/how-to-use-lightdash-deploy#automatically-deploy-your-changes-to-lightdash-using-a-github-action"
                                    target="_blank"
                                    rel="noreferrer"
                                />
                            ),
                            deployLink: (
                                <Anchor
                                    href="https://docs.lightdash.com/guides/cli/how-to-use-lightdash-deploy#lightdash-deploy-syncs-the-changes-in-your-dbt-project-to-lightdash"
                                    target="_blank"
                                    rel="noreferrer"
                                />
                            ),
                        }}
                    />
                </Text>
            </Alert>
        </Stack>
    );
};

export default DbtManifestForm;
