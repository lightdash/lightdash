import { type UiStringKey } from '@lightdash/common';
import { Badge, Button, Divider, Group, Text, Tooltip } from '@mantine/core';
import { IconChevronDown, IconChevronRight } from '@tabler/icons-react';
import { Fragment, type FC } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';
import { DefaultZoomButton } from './DateZoomPills';
import {
    getControlTotal,
    useControlCounts,
    type ControlCounts,
} from './useControlCounts';
import { useHasControlsToggle } from './useHasControlsToggle';

type LeadProps = {
    counts: ControlCounts;
    isOpen: boolean;
    onToggle: () => void;
    /** The toggle, when there is something to collapse (default true). */
    withToggle?: boolean;
    /** The dashboard-wide default zoom (default true). */
    withDefaultZoom?: boolean;
};

// The strip's start: the toggle, then the default zoom, each followed by a
// divider; the rest of the controls follow
export const ControlsLead: FC<LeadProps> = ({
    counts,
    isOpen,
    onToggle,
    withToggle = true,
    withDefaultZoom = true,
}) => {
    const getUiString = useUiStrings();
    const total = getControlTotal(counts);
    return (
        <>
            {/* Collapsed, it stays to expand the strip */}
            {withToggle && (total > 0 || !isOpen) && (
                <Group gap="xs" wrap="nowrap" mih={30}>
                    <Tooltip
                        fz="xs"
                        label={getUiString(
                            isOpen
                                ? 'controls.hideControls'
                                : 'controls.showControls',
                        )}
                    >
                        <Button
                            size="xs"
                            // No colour: the theme's full-text ghost
                            variant="subtle"
                            fw={600}
                            aria-expanded={isOpen}
                            leftSection={
                                <MantineIcon
                                    icon={
                                        isOpen
                                            ? IconChevronDown
                                            : IconChevronRight
                                    }
                                    color="dimmed"
                                />
                            }
                            rightSection={
                                <Badge size="xs" circle>
                                    {total}
                                </Badge>
                            }
                            data-controls-toggle
                            onClick={() => {
                                onToggle();
                                // The other state's toggle replaces this one
                                setTimeout(() =>
                                    document
                                        .querySelector<HTMLElement>(
                                            '[data-controls-toggle]',
                                        )
                                        ?.focus(),
                                );
                            }}
                        >
                            {getUiString('controls.title')}
                        </Button>
                    </Tooltip>
                    <Divider orientation="vertical" />
                </Group>
            )}
            {withDefaultZoom && <DefaultZoomButton />}
        </>
    );
};

const COUNT_WORDS: [keyof ControlCounts, UiStringKey, UiStringKey][] = [
    [
        'filters',
        'filters.summary.filterSingular',
        'filters.summary.filterPlural',
    ],
    [
        'parameters',
        'filters.summary.parameterSingular',
        'filters.summary.parameterPlural',
    ],
    [
        'dateZooms',
        'controls.summary.dateZoomSingular',
        'controls.summary.dateZoomPlural',
    ],
];

// "12 filters · 2 parameters · 1 date zoom", the kinds present only
const ControlsCountLine: FC<{ counts: ControlCounts }> = ({ counts }) => {
    const getUiString = useUiStrings();
    const parts = COUNT_WORDS.filter(([kind]) => counts[kind] > 0);
    return (
        <Text fz="xs" c="dimmed" truncate miw={0}>
            {parts.map(([kind, singular, plural], index) => (
                <Fragment key={kind}>
                    {index > 0 && ' · '}
                    <Text span fz="xs" fw={600} c="var(--mantine-color-text)">
                        {counts[kind]}
                    </Text>{' '}
                    {getUiString(counts[kind] === 1 ? singular : plural)}
                </Fragment>
            ))}
        </Text>
    );
};

type CollapsedProps = {
    counts: ControlCounts;
    onExpand: () => void;
    withToggle?: boolean;
    withDefaultZoom?: boolean;
    className?: string;
};

// Collapsed, the strip keeps its place: the toggle, the default zoom (still
// usable) and a count of each kind
export const ControlsCollapsedStrip: FC<CollapsedProps> = ({
    counts,
    onExpand,
    withToggle,
    withDefaultZoom,
    className,
}) => (
    <Group
        className={className}
        gap="xs"
        wrap="nowrap"
        px="lg"
        py="xxs"
        mih={30}
    >
        <ControlsLead
            counts={counts}
            isOpen={false}
            onToggle={onExpand}
            withToggle={withToggle}
            withDefaultZoom={withDefaultZoom}
        />
        <ControlsCountLine counts={counts} />
    </Group>
);

// The app's collapsed strip, counting what the bar would show
export const ControlsSummary: FC<{
    isEditMode: boolean;
    onExpand: () => void;
}> = ({ isEditMode, onExpand }) => (
    <ControlsCollapsedStrip
        counts={useControlCounts()}
        onExpand={onExpand}
        withToggle={useHasControlsToggle(isEditMode)}
    />
);
