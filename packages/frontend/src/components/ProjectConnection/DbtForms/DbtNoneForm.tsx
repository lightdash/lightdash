import { Alert, Anchor, Stack, Text } from '@mantine/core';
import { IconExclamationCircle } from '@tabler/icons-react';
import { type FC } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import MantineIcon from '../../common/MantineIcon';
import { useFormContext } from '../formContext';
import BooleanSwitch from '../Inputs/BooleanSwitch';

const DbtNoneForm: FC<{ disabled: boolean }> = ({ disabled }) => {
    const { t } = useTranslation('projectConnection');
    const form = useFormContext();
    return (
        <Stack>
            <Alert
                color="orange"
                icon={<MantineIcon icon={IconExclamationCircle} />}
            >
                <Text fz="sm">
                    <Trans
                        t={t}
                        i18nKey="dbtForms.none.cliDeployed"
                        components={{
                            deployLink: (
                                <Anchor
                                    href="https://docs.lightdash.com/guides/cli/how-to-use-lightdash-deploy"
                                    target="_blank"
                                    rel="noreferrer"
                                    fz="sm"
                                />
                            ),
                        }}
                    />
                </Text>
            </Alert>

            <BooleanSwitch
                onLabel={t('state.yes', { ns: 'common' })}
                offLabel={t('state.no', { ns: 'common' })}
                disabled={disabled}
                {...form.getInputProps('dbt.hideRefreshButton')}
                name="dbt.hideRefreshButton"
                label={t('dbtForms.none.hideRefreshButton')}
                description={
                    <Text fz="sm">
                        <Trans
                            t={t}
                            i18nKey="dbtForms.none.hideRefreshButtonDescription"
                            components={{
                                docsLink: (
                                    <Anchor
                                        href="https://docs.lightdash.com/references/dbt-projects"
                                        target="_blank"
                                        rel="noreferrer"
                                        fz="sm"
                                    />
                                ),
                            }}
                        />
                    </Text>
                }
            />
        </Stack>
    );
};

export default DbtNoneForm;
