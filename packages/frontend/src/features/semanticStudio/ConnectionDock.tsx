import { Box, Text } from '@mantine/core';
import { IconArrowRight } from '@tabler/icons-react';
import { type FC } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../../components/common/MantineIcon';
import { WarehouseTypeLabels } from '../../components/ProjectConnection/ProjectConnectFlow/utils';
import {
    getLiveSourceIconClass,
    type AvailableLiveSource,
} from '../externalConnections/liveSources/liveSourceCatalog';
import classes from './ConnectionDock.module.css';
import { KindIcon } from './shared';

const WAREHOUSE_LOGOS = WarehouseTypeLabels.flatMap((warehouse) =>
    warehouse.iconType === 'image'
        ? [
              {
                  key: warehouse.key,
                  label: warehouse.label,
                  image: warehouse.image,
              },
          ]
        : [],
);

const LIVE_LOGOS_SHOWN = 3;

/** Pinned under the tree while the project has no warehouse; the supported ones drift past. */
export const ConnectWarehouseDock: FC<{ path: string }> = ({ path }) => (
    <Box component={Link} to={path} className={classes.dock}>
        <Box className={classes.marquee} aria-hidden>
            <Box className={classes.track}>
                {[...WAREHOUSE_LOGOS, ...WAREHOUSE_LOGOS].map(
                    ({ label, image }, index) => (
                        <Box key={`${label}-${index}`} className={classes.chip}>
                            <img src={image} alt="" />
                        </Box>
                    ),
                )}
            </Box>
        </Box>
        <Box className={classes.label}>
            <Text fz={13} fw={500} truncate>
                Connect a warehouse
            </Text>
            <MantineIcon
                icon={IconArrowRight}
                size={14}
                className={classes.arrow}
            />
        </Box>
    </Box>
);

/** While warehouse tables are left to model: a dashed slot for the next one. */
export const ModelTableDock: FC<{
    title: string;
    subtitle: string;
    warehouseType: string | null;
    onStart: () => void;
}> = ({ title, subtitle, warehouseType, onStart }) => {
    const logo = WAREHOUSE_LOGOS.find(({ key }) => key === warehouseType);
    return (
        <Box
            component="button"
            type="button"
            className={classes.slot}
            onClick={onStart}
        >
            <Box className={classes.slotLabel}>
                {logo ? (
                    <Box className={classes.logoTile}>
                        <img src={logo.image} alt={logo.label} />
                    </Box>
                ) : null}
                <Box miw={0} flex={1}>
                    <Text fz={13} fw={500} truncate>
                        {title}
                    </Text>
                    <Text fz={11} c="dimmed" truncate>
                        {subtitle}
                    </Text>
                </Box>
                <MantineIcon
                    icon={IconArrowRight}
                    size={14}
                    className={classes.arrow}
                />
            </Box>
        </Box>
    );
};

/** A quieter nudge once the warehouse is in: a saved query is the next thing to model. */
export const VirtualViewSuggestion: FC<{ path: string }> = ({ path }) => (
    <Box component={Link} to={path} className={classes.suggestion}>
        <KindIcon kind="sqlViews" size={14} />
        <Text fz="xs" truncate inherit>
            Add a virtual view
        </Text>
    </Box>
);

/** Quiet, like the virtual view nudge: tools queried live, no warehouse needed; shows the turned-on integrations. */
export const LiveSourceSuggestion: FC<{
    sources: readonly AvailableLiveSource[];
    onAdd: () => void;
}> = ({ sources, onAdd }) => (
    <Box
        component="button"
        type="button"
        className={classes.suggestion}
        onClick={onAdd}
    >
        <Box className={classes.miniLogos} aria-hidden>
            {sources.slice(0, LIVE_LOGOS_SHOWN).map(({ label, icon }) => (
                <img
                    key={label}
                    src={icon}
                    alt=""
                    className={getLiveSourceIconClass(icon)}
                />
            ))}
        </Box>
        <Text fz="xs" truncate inherit>
            Add a live source
        </Text>
    </Box>
);
