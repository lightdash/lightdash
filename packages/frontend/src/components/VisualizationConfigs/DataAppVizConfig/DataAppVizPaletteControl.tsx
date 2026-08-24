import { type OrganizationColorPalette } from '@lightdash/common';
import { Box } from '@mantine/core';
import { type FC } from 'react';
import { PalettePicker } from '../../common/PalettePicker/PalettePicker';
import { Config } from '../common/Config';
import { DATA_APP_VIZ_CONTROL_WIDTH } from './dataAppVizControlLayout';

type Props = {
    value: string | null;
    onChange: (value: string | null) => void;
    palettes: OrganizationColorPalette[];
};

const DataAppVizPaletteControl: FC<Props> = ({ value, onChange, palettes }) => (
    <Config.Group wrap="nowrap" data-data-app-viz-control-row>
        <Config.Label>Color palette</Config.Label>
        <Box w={DATA_APP_VIZ_CONTROL_WIDTH} miw={DATA_APP_VIZ_CONTROL_WIDTH}>
            <PalettePicker
                ariaLabel="Color palette"
                value={value}
                onChange={onChange}
                palettes={palettes}
                parentLabel="Project default"
                showPreview={false}
            />
        </Box>
    </Config.Group>
);

export default DataAppVizPaletteControl;
