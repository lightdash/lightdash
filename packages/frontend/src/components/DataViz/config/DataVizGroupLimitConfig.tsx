import {
    DEFAULT_GROUP_LIMIT_CONFIG,
    type ChartKind,
    type GroupLimitConfig,
} from '@lightdash/common';
import {
    NumberInput,
    Stack,
    Switch,
    Text,
    TextInput,
    Tooltip,
} from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import { type FC } from 'react';
import {
    useAppDispatch as useVizDispatch,
    useAppSelector as useVizSelector,
} from '../../../features/sqlRunner/store/hooks';
import { Config } from '../../VisualizationConfigs/common/Config';
import MantineIcon from '../../common/MantineIcon';
import { type BarChartActionsType } from '../store/barChartSlice';
import { type LineChartActionsType } from '../store/lineChartSlice';
import { cartesianChartSelectors } from '../store/selectors';

type Props = {
    selectedChartType: ChartKind;
    actions: BarChartActionsType | LineChartActionsType;
    totalGroups: number;
};

export const DataVizGroupLimitConfig: FC<Props> = ({
    selectedChartType,
    actions,
    totalGroups,
}) => {
    const dispatch = useVizDispatch();

    const groupLimit = useVizSelector((state) =>
        cartesianChartSelectors.getGroupLimit(state, selectedChartType),
    );

    const isEnabled = groupLimit?.enabled ?? false;
    const maxGroups = groupLimit?.maxGroups ?? DEFAULT_GROUP_LIMIT_CONFIG.maxGroups;
    const otherLabel = groupLimit?.otherLabel ?? DEFAULT_GROUP_LIMIT_CONFIG.otherLabel;

    // Calculate how many groups will be aggregated into "Other"
    const groupsInOther = isEnabled ? Math.max(0, totalGroups - maxGroups) : 0;

    const handleEnabledChange = (checked: boolean) => {
        dispatch(actions.setGroupLimitEnabled(checked));
    };

    const handleMaxGroupsChange = (value: number | '') => {
        if (typeof value === 'number' && value >= 1) {
            dispatch(actions.setGroupLimitMaxGroups(value));
        }
    };

    const handleOtherLabelChange = (value: string) => {
        dispatch(actions.setGroupLimitOtherLabel(value));
    };

    return (
        <Config>
            <Config.Section>
                <Config.Group>
                    <Config.Heading>Limit groups</Config.Heading>
                    <Tooltip
                        variant="xs"
                        label="Show only the top N groups and aggregate the rest into an 'Other' category"
                        multiline
                        w={200}
                    >
                        <MantineIcon
                            icon={IconInfoCircle}
                            color="gray.6"
                            size="sm"
                        />
                    </Tooltip>
                </Config.Group>
                <Stack spacing="xs">
                    <Switch
                        label="Limit visible groups"
                        checked={isEnabled}
                        onChange={(event) =>
                            handleEnabledChange(event.currentTarget.checked)
                        }
                        size="xs"
                    />
                    {isEnabled && (
                        <>
                            <NumberInput
                                label="Show top"
                                value={maxGroups}
                                min={1}
                                max={Math.max(1, totalGroups - 1)}
                                onChange={handleMaxGroupsChange}
                                size="xs"
                                styles={{
                                    label: { fontSize: 12 },
                                }}
                            />
                            <TextInput
                                label="'Other' label"
                                value={otherLabel}
                                onChange={(event) =>
                                    handleOtherLabelChange(
                                        event.currentTarget.value,
                                    )
                                }
                                placeholder="Other"
                                size="xs"
                                styles={{
                                    label: { fontSize: 12 },
                                }}
                            />
                            {groupsInOther > 0 && (
                                <Text size="xs" c="dimmed">
                                    {groupsInOther} group
                                    {groupsInOther !== 1 ? 's' : ''} will be
                                    combined into "{otherLabel}"
                                </Text>
                            )}
                        </>
                    )}
                </Stack>
            </Config.Section>
        </Config>
    );
};
