import {
    type DashboardFilterableField,
    type DashboardTab,
} from '@lightdash/common';
import { Box, Button, Group, Paper, Stack, Text } from '@mantine/core';
import { type FC, type MouseEvent } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';
import classes from '../../features/dashboardControls/FilterEditor.module.css';
import FilterFieldSelect from '../../features/dashboardFilters/FilterConfiguration/FilterFieldSelect';
import { LD_FIELD_COLORS } from '../../theme/fieldColors';
import { CONTROL_TYPES, type ControlType } from './controlTypes';
import sentenceClasses from './FilterPopoverSentence.module.css';

// From `FilterEditor.tsx` (not exported): the field search takes focus
const focusStartOnMount = (node: HTMLElement | null) => {
    const input = node?.querySelector<HTMLElement>(
        '[data-controls-start] input',
    );
    input?.setAttribute('data-autofocus', '');
    input?.focus({ preventScroll: true });
};

// A press on a type keeps the list open (no blur of the search, no click
// outside), so the types do not move before the click lands
const keepListOpen = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
};

type Props = {
    fields: DashboardFilterableField[];
    tabs: DashboardTab[];
    /** "Or start from a type" under the field search. */
    withTypes: boolean;
    onPickField: (field: DashboardFilterableField) => void;
    onPickType: (type: ControlType) => void;
};

// "Add control": the shipped field search, opened, and the types a control
// can start from before it has a field
export const AddControlMenu: FC<Props> = ({
    fields,
    tabs,
    withTypes,
    onPickField,
    onPickType,
}) => {
    const getUiString = useUiStrings();
    return (
        <Paper
            shadow="md"
            radius="md"
            w="min(400px, calc(100vw - 56px))"
            ref={focusStartOnMount}
        >
            <Box
                className={`${classes.content} ${withTypes ? sentenceClasses.inlineList : ''}`}
                data-controls-start
            >
                <FilterFieldSelect
                    fields={fields}
                    availableTileFilters={{}}
                    tiles={[]}
                    tabs={tabs}
                    activeTabUuid={tabs[0]?.uuid}
                    selectedField={undefined}
                    withLabel={false}
                    placeholder={getUiString('filters.rail.searchFields')}
                    // In the menu's flow, so the types stay in view
                    withinPortal={!withTypes}
                    defaultOpened
                    onChange={onPickField}
                />
            </Box>
            {withTypes && (
                <Stack gap="xs" className={classes.footer}>
                    <Text fz="xs" c="dimmed">
                        Or start from a type, and choose tiles after
                    </Text>
                    <Group gap="xs" wrap="nowrap" onMouseDown={keepListOpen}>
                        {CONTROL_TYPES.map((option) => (
                            <Button
                                key={option.type}
                                variant="default"
                                size="xs"
                                flex={1}
                                leftSection={
                                    <MantineIcon
                                        icon={option.icon}
                                        color={LD_FIELD_COLORS.dimension.color}
                                    />
                                }
                                onClick={() => onPickType(option.type)}
                            >
                                {option.label}
                            </Button>
                        ))}
                    </Group>
                </Stack>
            )}
        </Paper>
    );
};
