import { type DateZoomControl } from '@lightdash/common';
import { Stack, Text } from '@mantine/core';
import { IconCalendar } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import { PolymorphicGroupButton } from '../../components/common/PolymorphicGroupButton';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';
import {
    selectAvailableCustomGranularities,
    useDashboardSelector,
} from '../dashboard/store';
import { getGranularityLabel } from '../dateZoom/utils';
import classes from './ControlSidebar.module.css';
import { formatTileCount } from './fieldLabels';

export const ZoomTypeIcon: FC = () => (
    <MantineIcon
        icon={IconCalendar}
        size={14}
        color="dimmed"
        className={classes.rowIcon}
    />
);

type Props = {
    control: DateZoomControl;
    tileCount: number;
    onOpen: (controlUuid: string) => void;
    onHover: (controlUuid: string) => void;
    onUnhover: (controlUuid: string) => void;
};

// A date zoom that is not being edited: its name, grain and tiles. Editor only
export const ZoomRow: FC<Props> = ({
    control,
    tileCount,
    onOpen,
    onHover,
    onUnhover,
}) => {
    const getUiString = useUiStrings();
    const availableCustomGranularities = useDashboardSelector(
        selectAvailableCustomGranularities,
    );
    const grain = getGranularityLabel(
        control.granularity,
        availableCustomGranularities,
        getUiString,
    );
    return (
        <PolymorphicGroupButton
            component="button"
            type="button"
            gap="xs"
            wrap="nowrap"
            align="flex-start"
            className={classes.row}
            data-controls-row={control.uuid}
            aria-expanded={false}
            onClick={() => onOpen(control.uuid)}
            onMouseEnter={() => onHover(control.uuid)}
            onMouseLeave={() => onUnhover(control.uuid)}
            onFocus={(event) => {
                if (event.currentTarget.matches(':focus-visible'))
                    onHover(control.uuid);
            }}
            onBlur={() => onUnhover(control.uuid)}
        >
            <ZoomTypeIcon />
            <Stack gap={0} miw={0}>
                <Text fz="sm" fw={600} truncate>
                    {control.name}
                </Text>
                <Text fz="xs" c="dimmed" truncate>
                    {grain}
                    {tileCount > 0 &&
                        ` · ${formatTileCount(getUiString, tileCount)}`}
                    {control.hidden && ' · Hidden from viewers'}
                    {tileCount === 0 && (
                        <>
                            {' · '}
                            <Text span inherit className={classes.required}>
                                No tiles · removed on save
                            </Text>
                        </>
                    )}
                </Text>
            </Stack>
        </PolymorphicGroupButton>
    );
};
