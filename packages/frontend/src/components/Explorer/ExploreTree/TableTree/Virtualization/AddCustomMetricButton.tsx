import {
    ExploreType,
    friendlyName,
    getCustomMetricType,
    getItemLabelWithoutTableName,
    type CompiledDimension,
} from '@lightdash/common';
import { ActionIcon, Button, Popover, Stack, Tooltip } from '@mantine/core';
import { IconArrowLeft, IconPlus } from '@tabler/icons-react';
import { useMemo, useState, type FC } from 'react';
import {
    explorerActions,
    selectTableName,
    useExplorerDispatch,
    useExplorerSelector,
} from '../../../../../features/explorer/store';
import { useExplore } from '../../../../../hooks/useExplore';
import useTracking from '../../../../../providers/Tracking/useTracking';
import { EventName } from '../../../../../types/Events';
import FieldSelect from '../../../../common/FieldSelect';
import MantineIcon from '../../../../common/MantineIcon';
import { useCustomMetricSourceId } from '../../CustomMetricSourceContext';

/** Picks a dimension, then an aggregation, and opens the custom metric modal. */
const AddCustomMetricButton: FC<{ tableName: string }> = ({ tableName }) => {
    const [opened, setOpened] = useState(false);
    const [dimension, setDimension] = useState<CompiledDimension | null>(null);
    const dispatch = useExplorerDispatch();
    const { track } = useTracking();
    const customMetricSourceId = useCustomMetricSourceId();
    const { data: explore } = useExplore(useExplorerSelector(selectTableName));

    const dimensions = useMemo(
        () =>
            Object.values(explore?.tables[tableName]?.dimensions ?? {}).filter(
                (item) =>
                    !item.hidden && getCustomMetricType(item.type).length > 0,
            ),
        [explore, tableName],
    );

    const close = () => {
        setOpened(false);
        setDimension(null);
    };

    // Live data sources can't run custom fields yet
    if (explore?.type === ExploreType.API_SOURCE || dimensions.length === 0) {
        return null;
    }

    return (
        <Popover
            opened={opened}
            onChange={(isOpen) => (isOpen ? setOpened(true) : close())}
            position="right-start"
            width={260}
            trapFocus
        >
            <Popover.Target>
                <Tooltip
                    label="Add a custom metric from a dimension"
                    position="left"
                    disabled={opened}
                >
                    <ActionIcon
                        size="sm"
                        c="dimmed"
                        aria-label="Add custom metric"
                        onClick={() => (opened ? close() : setOpened(true))}
                        data-testid="VirtualSectionHeader/AddCustomMetricButton"
                    >
                        <MantineIcon icon={IconPlus} />
                    </ActionIcon>
                </Tooltip>
            </Popover.Target>
            <Popover.Dropdown p="xs">
                {dimension ? (
                    <Stack gap={2}>
                        <Button
                            variant="subtle"
                            color="gray"
                            size="compact-xs"
                            justify="flex-start"
                            leftSection={<MantineIcon icon={IconArrowLeft} />}
                            onClick={() => setDimension(null)}
                        >
                            {getItemLabelWithoutTableName(dimension)}
                        </Button>
                        {getCustomMetricType(dimension.type).map((type) => (
                            <Button
                                key={type}
                                variant="subtle"
                                color="gray"
                                c="var(--mantine-color-text)"
                                size="compact-sm"
                                justify="flex-start"
                                fw={400}
                                onClick={() => {
                                    track({
                                        name: EventName.ADD_CUSTOM_METRIC_CLICKED,
                                    });
                                    dispatch(
                                        explorerActions.toggleAdditionalMetricModal(
                                            {
                                                type,
                                                item: dimension,
                                                isEditing: false,
                                                mergeSourceId:
                                                    customMetricSourceId,
                                            },
                                        ),
                                    );
                                    close();
                                }}
                            >
                                {friendlyName(type)}
                            </Button>
                        ))}
                    </Stack>
                ) : (
                    <FieldSelect
                        size="xs"
                        placeholder="Pick a dimension to measure"
                        focusOnRender
                        items={dimensions}
                        hasGrouping
                        comboboxProps={{ withinPortal: false }}
                        onChange={(item) => item && setDimension(item)}
                    />
                )}
            </Popover.Dropdown>
        </Popover>
    );
};

export default AddCustomMetricButton;
