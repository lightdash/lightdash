import { Colors, Tab, Tabs } from '@blueprintjs/core';
import { Popover2 } from '@blueprintjs/popover2';
import { Box, Button } from '@mantine/core';
import React from 'react';
import { COLLAPSABLE_CARD_BUTTON_PROPS } from '../common/CollapsableCard';
import { useVisualizationContext } from '../LightdashVisualization/VisualizationProvider';
import ConditionalFormattingList from './ConditionalFormattingList';
import GeneralSettings from './GeneralSettings';

const TableConfigPanel: React.FC = () => {
    const { resultsData } = useVisualizationContext();
    const disabled = !resultsData;

    return (
        <Popover2
            disabled={disabled}
            position="bottom"
            content={
                <Box
                    w={320}
                    p="sm"
                    sx={{
                        // FIXME: remove after Blueprint migration is complete
                        'label.bp4-label': {
                            display: 'inline-flex',
                            gap: '0.214em',
                            color: Colors.DARK_GRAY1,
                            fontWeight: 600,
                        },
                    }}
                >
                    <Tabs>
                        <Tab
                            id="general"
                            title="General"
                            panel={<GeneralSettings />}
                        />
                        <Tab
                            id="conditional-formatting"
                            title="Conditional formatting"
                            panel={<ConditionalFormattingList />}
                        />
                    </Tabs>
                </Box>
            }
        >
            <Button {...COLLAPSABLE_CARD_BUTTON_PROPS} disabled={disabled}>
                Configure
            </Button>
        </Popover2>
    );
};

export default TableConfigPanel;
