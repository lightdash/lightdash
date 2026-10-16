import { type Compact } from '@lightdash/common';
import { ActionIcon, Select, Stack, TextInput, Tooltip } from '@mantine/core';
import { IconEye, IconEyeOff } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import {
    useAppDispatch as useVizDispatch,
    useAppSelector as useVizSelector,
} from '../../../features/sqlRunner/store/hooks';
import MantineIcon from '../../common/MantineIcon';
import { StyleOptions } from '../../VisualizationConfigs/BigNumberConfig/common';
import { Config } from '../../VisualizationConfigs/common/Config';
import { setLabel, setShowLabel, setStyle } from '../store/bigNumberSlice';

/** `StyleOptions` uses an empty string for "no compact notation". */
const NO_COMPACT_STYLE = '';

export const BigNumberDisplayConfig = () => {
    const { t } = useTranslation('dataViz');
    const dispatch = useVizDispatch();
    const display = useVizSelector((state) => state.bigNumberConfig.display);
    const valueField = useVizSelector(
        (state) => state.bigNumberConfig.fieldConfig?.y[0],
    );

    const showLabel = display?.showLabel ?? true;

    return (
        <Stack gap="sm" mb="lg">
            <Config.Section>
                <Config.Group>
                    <Config.Heading>{t('bigNumber.label')}</Config.Heading>
                    <Tooltip
                        label={
                            showLabel
                                ? t('bigNumber.hideLabel')
                                : t('bigNumber.showLabel')
                        }
                    >
                        <ActionIcon
                            onClick={() => dispatch(setShowLabel(!showLabel))}
                        >
                            <MantineIcon
                                icon={showLabel ? IconEye : IconEyeOff}
                            />
                        </ActionIcon>
                    </Tooltip>
                </Config.Group>

                <TextInput
                    size="xs"
                    disabled={!showLabel}
                    placeholder={valueField?.reference ?? t('bigNumber.label')}
                    value={display?.label ?? ''}
                    onChange={(event) =>
                        dispatch(
                            setLabel(event.currentTarget.value || undefined),
                        )
                    }
                />
            </Config.Section>

            <Config.Section>
                <Config.Group>
                    <Config.Label>{t('bigNumber.format')}</Config.Label>
                    <Select
                        size="xs"
                        data={StyleOptions}
                        value={display?.style ?? NO_COMPACT_STYLE}
                        allowDeselect={false}
                        onChange={(value) =>
                            dispatch(
                                setStyle(
                                    !value || value === NO_COMPACT_STYLE
                                        ? undefined
                                        : (value as Compact),
                                ),
                            )
                        }
                    />
                </Config.Group>
            </Config.Section>
        </Stack>
    );
};
