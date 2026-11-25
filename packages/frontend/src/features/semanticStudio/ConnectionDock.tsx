import { Box, Text } from '@mantine/core';
import { IconArrowRight } from '@tabler/icons-react';
import { type FC } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../../components/common/MantineIcon';
import { WarehouseTypeLabels } from '../../components/ProjectConnection/ProjectConnectFlow/utils';
import {
    getLiveSourceIconClass,
    isAvailableLiveSource,
    LIVE_SOURCE_CATALOG,
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

const LIVE_LOGOS = LIVE_SOURCE_CATALOG.filter(isAvailableLiveSource)
    .slice(0, 3)
    .map(({ label, icon }) => ({ label, icon }));

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

/** Once the warehouse is in but nothing is modelled: a dashed slot for the first model. */
export const ModelFirstTableDock: FC<{
    tableCount: number;
    warehouseType: string | null;
    onStart: () => void;
}> = ({ tableCount, warehouseType, onStart }) => {
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
                        Model your first table
                    </Text>
                    <Text fz={11} c="dimmed" truncate>
                        {`${tableCount} ${tableCount === 1 ? 'table' : 'tables'}`}
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

/** Quiet, like the virtual view nudge: tools queried live, no warehouse needed. */
export const LiveSourceSuggestion: FC<{ onAdd: () => void }> = ({ onAdd }) => (
    <Box
        component="button"
        type="button"
        className={classes.suggestion}
        onClick={onAdd}
    >
        <Box className={classes.miniLogos} aria-hidden>
            {LIVE_LOGOS.map(({ label, icon }) => (
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
