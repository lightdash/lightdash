import { Box, SegmentedControl, Tooltip } from '@mantine/core';
import { type FC } from 'react';
import { useUiStrings } from '../../../ee/providers/Embed/useUiStrings';
import { type AppView } from './useAppLineageView';

/** App | Lineage toggle for an app host header. */
export const AppViewSwitcher: FC<{
    view: AppView;
    onChange: (view: AppView) => void;
    canShowLineage: boolean;
}> = ({ view, onChange, canShowLineage }) => {
    const getUiString = useUiStrings();
    return (
        <Tooltip
            label={getUiString('dataApps.view.lineageUnavailable')}
            disabled={canShowLineage}
            position="bottom"
        >
            <Box>
                <SegmentedControl
                    size="xs"
                    value={canShowLineage ? view : 'app'}
                    disabled={!canShowLineage}
                    onChange={(value) =>
                        onChange(value === 'lineage' ? 'lineage' : 'app')
                    }
                    data={[
                        {
                            value: 'app',
                            label: getUiString('dataApps.view.app'),
                        },
                        {
                            value: 'lineage',
                            label: getUiString('dataApps.view.lineage'),
                        },
                    ]}
                />
            </Box>
        </Tooltip>
    );
};
