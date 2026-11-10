import { type WarehouseTypes } from '@lightdash/common';
import { Box } from '@mantine/core';
import {
    IconChartBar,
    IconDatabase,
    IconLayoutDashboard,
    IconMessage,
} from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import {
    getWarehouseIcon,
    getWarehouseLabel,
} from '../../components/ProjectConnection/ProjectConnectFlow/utils';
import classes from './SemanticLayerPreview.module.css';

const RAW_TABLES = ['tbl_ord_dtl', 'pmt_txn_v2', 'cust_mstr'];
const DIMENSIONS = ['Month', 'Status'];
const TOOLS = [
    { icon: IconChartBar, label: 'Chart' },
    { icon: IconLayoutDashboard, label: 'Dashboard' },
    { icon: IconMessage, label: 'Ask AI' },
];

// In px, matched to the 608 by 172 scene in the CSS
const BEAMS_IN = [
    'M148 74 C180 74 180 86 212 86',
    'M148 106 C180 106 180 86 212 86',
    'M148 138 C180 138 180 86 212 86',
];
const BEAMS_OUT = [
    'M396 86 C424 86 424 34 452 34',
    'M396 86 L452 86',
    'M396 86 C424 86 424 138 452 138',
];

const Beams: FC = () => (
    <svg className={classes.beams} viewBox="0 0 608 172">
        <g className={classes.rails}>
            {[...BEAMS_IN, ...BEAMS_OUT].map((d) => (
                <path key={d} d={d} />
            ))}
        </g>
        <g className={classes.pulses} data-direction="in">
            {BEAMS_IN.map((d) => (
                <path key={d} d={d} pathLength={100} />
            ))}
        </g>
        <g className={classes.pulses} data-direction="out">
            {BEAMS_OUT.map((d) => (
                <path key={d} d={d} pathLength={100} />
            ))}
        </g>
    </svg>
);

/** Raw warehouse tables become one definition, and every tool reads the same number from it. */
export const SemanticLayerPreview: FC<{
    warehouseType: WarehouseTypes | null;
}> = ({ warehouseType }) => (
    <Box className={classes.stage} aria-hidden>
        <Box className={classes.scene}>
            <Beams />
            <Box className={classes.warehouse}>
                <Box className={classes.warehouseHead}>
                    {(warehouseType && getWarehouseIcon(warehouseType, 16)) ?? (
                        <MantineIcon icon={IconDatabase} size={14} />
                    )}
                    {(warehouseType && getWarehouseLabel(warehouseType)) ??
                        'Your warehouse'}
                </Box>
                {RAW_TABLES.map((table) => (
                    <Box key={table} className={classes.rawTable}>
                        {table}
                    </Box>
                ))}
            </Box>
            <Box className={classes.layer}>
                <Box className={classes.layerHead}>Semantic layer</Box>
                <Box className={classes.metric}>
                    <Box className={classes.pill} data-kind="metric">
                        Revenue
                    </Box>
                    <Box className={classes.formula}>sum(amt_usd)</Box>
                </Box>
                <Box className={classes.pills}>
                    {DIMENSIONS.map((dimension) => (
                        <Box
                            key={dimension}
                            className={classes.pill}
                            data-kind="dimension"
                        >
                            {dimension}
                        </Box>
                    ))}
                </Box>
            </Box>
            <Box className={classes.tools}>
                {TOOLS.map(({ icon, label }) => (
                    <Box key={label} className={classes.tool}>
                        <MantineIcon icon={icon} size={14} color="dimmed" />
                        <Box className={classes.toolLabel}>{label}</Box>
                        <Box className={classes.value}>$1.24M</Box>
                    </Box>
                ))}
            </Box>
        </Box>
    </Box>
);
