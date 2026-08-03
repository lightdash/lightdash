import { type HomepageContentLayout } from '@lightdash/common';
import { Box, SegmentedControl, Tooltip } from '@mantine-8/core';
import { IconLayoutGrid, IconLayoutList } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';

const OPTIONS = [
    { value: 'card', label: 'Cards', icon: IconLayoutGrid },
    { value: 'list', label: 'Compact', icon: IconLayoutList },
] as const;

/** The one layout switcher every content-listing block uses, so the options
 * always carry the same icons and names. Compact's arrangement (tile columns
 * vs rows) resolves from the block's width — geometry is not an admin choice. */
export const ContentLayoutControl: FC<{
    value: HomepageContentLayout;
    onChange: (layout: HomepageContentLayout) => void;
}> = ({ value, onChange }) => (
    <SegmentedControl
        size="xs"
        value={value}
        onChange={(next) => onChange(next as HomepageContentLayout)}
        data={OPTIONS.map((option) => ({
            value: option.value,
            label: (
                <Tooltip label={option.label} openDelay={200}>
                    <Box component="span" lh={0} display="inline-block">
                        <MantineIcon icon={option.icon} />
                    </Box>
                </Tooltip>
            ),
        }))}
    />
);
