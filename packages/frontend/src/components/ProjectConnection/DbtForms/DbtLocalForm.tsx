import { Alert, Stack, Text } from '@mantine/core';
import { IconExclamationCircle, IconInfoCircle } from '@tabler/icons-react';
import { type FC } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import MantineIcon from '../../common/MantineIcon';
import DbtVersionSelect from '../Inputs/DbtVersion';

const DbtLocalForm: FC<{ disabled: boolean }> = ({ disabled }) => {
    const { t } = useTranslation('projectConnection');
    return (
        <Stack>
            <DbtVersionSelect disabled={disabled} />

            <Alert
                color="orange"
                icon={<MantineIcon icon={IconExclamationCircle} />}
            >
                <Text fz="sm">{t('dbtForms.local.warning')}</Text>
            </Alert>

            <Alert color="blue" icon={<MantineIcon icon={IconInfoCircle} />}>
                <Stack gap="xs">
                    <Text fz="sm">
                        <Trans
                            t={t}
                            i18nKey="dbtForms.local.installScriptHint"
                            components={{ b: <b /> }}
                        />
                    </Text>

                    <Text fz="sm">
                        <Trans
                            t={t}
                            i18nKey="dbtForms.local.envVarHint"
                            components={{ b: <b /> }}
                        />
                    </Text>
                </Stack>
            </Alert>
        </Stack>
    );
};

export default DbtLocalForm;
