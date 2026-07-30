import { type Compact } from '@lightdash/common';
import { ActionIcon, Select, Stack, TextInput, Tooltip } from '@mantine-8/core';
import { IconEye, IconEyeOff } from '@tabler/icons-react';
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
                    <Config.Heading>Label</Config.Heading>
                    <Tooltip
                        label={showLabel ? 'Hide label' : 'Show label'}
                        withinPortal
                    >
                        <ActionIcon
                            variant="subtle"
                            color="ldGray.6"
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
                    placeholder={valueField?.reference ?? 'Label'}
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
                    <Config.Label>Format</Config.Label>
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
