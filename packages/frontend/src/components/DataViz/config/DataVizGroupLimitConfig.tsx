import { DEFAULT_GROUP_LIMIT_CONFIG, type ChartKind } from '@lightdash/common';
import { NumberInput, Stack, Switch, Text, Tooltip } from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import { type FC } from 'react';
import {
    useAppDispatch as useVizDispatch,
    useAppSelector as useVizSelector,
} from '../../../features/sqlRunner/store/hooks';
import MantineIcon from '../../common/MantineIcon';
import { Config } from '../../VisualizationConfigs/common/Config';
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
    const maxGroups =
        groupLimit?.maxGroups ?? DEFAULT_GROUP_LIMIT_CONFIG.maxGroups;

    const groupsHidden = isEnabled ? Math.max(0, totalGroups - maxGroups) : 0;

    return (
        <Config>
            <Config.Section>
                <Config.Group>
                    <Config.Heading>Limit groups</Config.Heading>
                    <Tooltip
                        variant="xs"
                        label="Show only the top N groups by value, hiding the rest"
                        multiline
                        w={200}
                    >
                        <MantineIcon
                            icon={IconInfoCircle}
                            color="ldGray.6"
                            size="sm"
                        />
                    </Tooltip>
                </Config.Group>
                <Stack spacing="xs">
                    <Switch
                        label="Limit visible groups"
                        checked={isEnabled}
                        onChange={(event) =>
                            dispatch(
                                actions.setGroupLimitEnabled(
                                    event.currentTarget.checked,
                                ),
                            )
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
                                onChange={(value) => {
                                    if (typeof value === 'number' && value >= 1)
                                        dispatch(
                                            actions.setGroupLimitMaxGroups(
                                                value,
                                            ),
                                        );
                                }}
                                size="xs"
                            />
                            {groupsHidden > 0 && (
                                <Text size="xs" c="dimmed">
                                    {groupsHidden} group
                                    {groupsHidden !== 1 ? 's' : ''} will be
                                    hidden
                                </Text>
                            )}
                        </>
                    )}
                </Stack>
            </Config.Section>
        </Config>
    );
};
