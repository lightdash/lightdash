import { DbtProjectType, FeatureFlags } from '@lightdash/common';
import { Alert, Text, Select } from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import React, { type FC } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import MantineIcon from '../../common/MantineIcon';
import { useFormContext } from '../formContext';

const DAYS_OF_WEEK = [
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
    'sunday',
] as const;

const StartOfWeekSelect: FC<{
    disabled: boolean;
    isRedeployRequired?: boolean;
}> = ({ disabled, isRedeployRequired = true }) => {
    const { t } = useTranslation('projectConnection');
    const daysOfWeekOptions = DAYS_OF_WEEK.map((day, index) => ({
        value: index.toString(),
        label: t(`inputs.startOfWeek.days.${day}`),
    }));
    const form = useFormContext();
    const field = form.getInputProps('warehouse.startOfWeek');
    const { data: timezoneSupportFlag } = useServerFeatureFlag(
        FeatureFlags.EnableTimezoneSupport,
    );
    const isTimezoneSupportEnabled = timezoneSupportFlag?.enabled === true;
    const isTimezoneSupportDisabled = timezoneSupportFlag?.enabled === false;
    const isCliDeployed = form.values.dbt.type === DbtProjectType.NONE;
    const isDaySelected = field.value !== null && field.value !== undefined;
    const dayName = daysOfWeekOptions.find(
        (option) => option.value === field.value?.toString(),
    )?.label;

    return (
        <>
            <Select
                name="warehouse.startOfWeek"
                clearable
                placeholder={t('inputs.startOfWeek.auto')}
                label={t('inputs.startOfWeek.label')}
                description={
                    isTimezoneSupportEnabled
                        ? t('inputs.startOfWeek.descriptionImmediate')
                        : t('inputs.startOfWeek.description')
                }
                data={daysOfWeekOptions}
                value={field.value?.toString()}
                onChange={(value) =>
                    field.onChange(value ? parseInt(value) : null)
                }
                disabled={disabled}
                comboboxProps={{
                    position: 'top',
                    middlewares: { flip: false },
                }}
            />
            {isTimezoneSupportDisabled &&
                isRedeployRequired &&
                isCliDeployed &&
                isDaySelected && (
                    <Alert
                        icon={<MantineIcon icon={IconInfoCircle} size={'md'} />}
                        title={t('inputs.startOfWeek.cliOptionTitle')}
                        color="blue"
                    >
                        <Trans
                            t={t}
                            i18nKey="inputs.startOfWeek.cliOptionDescription"
                            values={{ value: field.value, day: dayName }}
                            components={{
                                option: <Text fw={500} span />,
                                code: <code />,
                            }}
                        />
                    </Alert>
                )}
        </>
    );
};

export default StartOfWeekSelect;
