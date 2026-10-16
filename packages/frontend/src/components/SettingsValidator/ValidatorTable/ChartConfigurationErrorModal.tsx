import { type ValidationErrorChartResponse } from '@lightdash/common';
import { Anchor, Button, Stack, Text } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import { type FC } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import Callout from '../../common/Callout';
import MantineModal from '../../common/MantineModal';
import { getLinkToResource } from '../utils/utils';

type Props = {
    validationError: ValidationErrorChartResponse | undefined;
    onClose: () => void;
};

export const ChartConfigurationErrorModal: FC<Props> = ({
    validationError,
    onClose,
}) => {
    const { t } = useTranslation('projectSettings');
    if (!validationError) {
        return null;
    }

    const chartUrl = getLinkToResource(
        validationError,
        validationError.projectUuid,
    );

    return (
        <MantineModal
            size="lg"
            title={t('validator.chartConfigModal.title')}
            icon={IconAlertTriangle}
            opened={!!validationError}
            onClose={onClose}
            actions={
                <Button component="a" href={chartUrl} target="_blank">
                    {t('validator.chartConfigModal.editChart')}
                </Button>
            }
        >
            <Stack gap="md">
                <Text fz="sm">
                    <Trans
                        t={t}
                        i18nKey="validator.chartConfigModal.chart"
                        values={{ name: validationError.name }}
                        components={{
                            link: (
                                <Anchor href={chartUrl} target="_blank">
                                    <Text span fw={600} />
                                </Anchor>
                            ),
                        }}
                    />
                </Text>

                <Callout
                    variant="warning"
                    title={t('validator.chartConfigModal.unusedDimension')}
                >
                    <Text fz="sm">
                        <Trans
                            t={t}
                            i18nKey="validator.chartConfigModal.unusedDimensionDescription"
                            values={{ fieldName: validationError.fieldName }}
                            components={{ b: <Text span fw={600} /> }}
                        />
                    </Text>
                </Callout>

                <Text fz="sm">
                    {t('validator.chartConfigModal.unmappedWarning')}
                </Text>

                <Text fz="sm" fw={500}>
                    {t('validator.chartConfigModal.toFix')}
                </Text>
                <Stack gap="xs" ml="md">
                    <Text fz="sm">
                        {t('validator.chartConfigModal.fixRemove')}
                    </Text>
                    <Text fz="sm">
                        {t('validator.chartConfigModal.fixAdd')}
                    </Text>
                </Stack>
            </Stack>
        </MantineModal>
    );
};
