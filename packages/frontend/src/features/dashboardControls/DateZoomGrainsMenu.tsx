import {
    DateGranularity,
    isStandardDateGranularity,
    type DateZoomControl,
} from '@lightdash/common';
import { Box, Checkbox, Menu, Text, Tooltip } from '@mantine/core';
import { type FC } from 'react';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';
import { getGranularityLabel } from '../dateZoom/utils';
import { splitGrains } from './dateZoomGrains';

const STANDARD_GRAINS: string[] = Object.values(DateGranularity);

// Standard grains in their order, then custom ones in the order they were enabled
const toggleGrain = (enabled: string[], grain: string): string[] => {
    const next = enabled.includes(grain)
        ? enabled.filter((other) => other !== grain)
        : [...enabled, grain];
    return [
        ...STANDARD_GRAINS.filter((standard) => next.includes(standard)),
        ...next.filter((other) => !isStandardDateGranularity(other)),
    ];
};

// "Used by Revenue zoom", "Used by 3 date zooms": the item names the grain
const formatGrainUsers = (names: string[]): string =>
    names.length === 1
        ? `Used by ${names[0]}`
        : `Used by ${names.length} date zooms`;

type Props = {
    enabledGranularities: string[];
    /** The dashboard's custom grains, by key. */
    customLabels: Record<string, string>;
    defaultGranularity: string | null;
    /** A checked grain one of them is at can't be unchecked. */
    namedZooms: Pick<DateZoomControl, 'uuid' | 'name' | 'granularity'>[];
    /** Each toggle, at once; unchecking the default clears it (null). */
    onChange: (
        enabledGranularities: string[],
        defaultGranularity: string | null,
    ) => void;
};

/** The grains viewers can pick, for every date zoom: a `Menu.Sub` dropdown's items. */
export const DateZoomGrainsMenu: FC<Props> = ({
    enabledGranularities,
    customLabels,
    defaultGranularity,
    namedZooms,
    onChange,
}) => {
    const getUiString = useUiStrings();
    const { custom } = splitGrains(
        Object.keys(customLabels),
        customLabels,
        getUiString,
    );
    // Unchecking a grain a named zoom is at would leave viewers unable to pick it back
    const getLockReason = (grain: string): string | null => {
        if (!enabledGranularities.includes(grain)) return null;
        const users = namedZooms
            .filter(({ granularity }) => granularity === grain)
            .map(({ name }) => name);
        if (users.length > 0) return formatGrainUsers(users);
        return enabledGranularities.length === 1
            ? 'Viewers need at least one grain'
            : null;
    };
    const toggle = (grain: string) => {
        const next = toggleGrain(enabledGranularities, grain);
        onChange(
            next,
            defaultGranularity !== null && next.includes(defaultGranularity)
                ? defaultGranularity
                : null,
        );
    };
    const item = (grain: string) => {
        const checked = enabledGranularities.includes(grain);
        const lockReason = getLockReason(grain);
        return (
            <Tooltip
                key={grain}
                fz="xs"
                multiline
                w={220}
                position="right"
                label={lockReason}
                disabled={lockReason === null}
            >
                {/* The wrapper takes the hover a disabled item does not */}
                <Box>
                    {/* Mantine keeps its own `menuitem` role; the state rides on it */}
                    <Menu.Item
                        aria-checked={checked}
                        disabled={lockReason !== null}
                        closeMenuOnClick={false}
                        leftSection={
                            <Checkbox
                                size="xs"
                                tabIndex={-1}
                                aria-hidden
                                readOnly
                                checked={checked}
                                disabled={lockReason !== null}
                            />
                        }
                        rightSection={
                            grain === defaultGranularity ? (
                                <Text span fz="xs" c="dimmed">
                                    Default
                                </Text>
                            ) : undefined
                        }
                        onClick={() => toggle(grain)}
                    >
                        {getGranularityLabel(grain, customLabels, getUiString)}
                    </Menu.Item>
                </Box>
            </Tooltip>
        );
    };
    return (
        <>
            <Menu.Label>For every date zoom on this dashboard</Menu.Label>
            {STANDARD_GRAINS.map(item)}
            {custom.length > 0 && (
                <>
                    <Menu.Divider />
                    <Menu.Label>
                        {getUiString('controls.dateZoom.custom')}
                    </Menu.Label>
                    {custom.map(item)}
                </>
            )}
        </>
    );
};
