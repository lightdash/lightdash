import { Alert, Text } from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import { Trans, useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import MantineIcon from '../../../../../../components/common/MantineIcon';

export const AiFeaturesDisabledAlert = () => {
    const { t } = useTranslation('aiCopilotAdmin');
    return (
        <Alert
            icon={<MantineIcon icon={IconInfoCircle} />}
            color="orange"
            title={t('settings.disabledAlert.title')}
        >
            <Text size="xs">
                <Trans
                    t={t}
                    i18nKey="settings.disabledAlert.body"
                    components={{
                        anchor: (
                            <Text
                                span
                                component={Link}
                                to="/generalSettings/ai/general"
                                td="underline"
                            />
                        ),
                    }}
                />
            </Text>
        </Alert>
    );
};
