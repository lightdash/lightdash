import { memo, type FC } from 'react';
import { VisualizationConfigTabs } from '../common/VisualizationConfigTabs';
import { Comparison } from './BigNumberComparison';
import { BigNumberConditionalFormatting } from './BigNumberConditionalFormatting';
import { Layout } from './BigNumberLayout';

export const ConfigTabs: FC = memo(() => (
    <VisualizationConfigTabs
        tabs={[
            { value: 'layout', label: 'Layout', panel: <Layout /> },
            { value: 'comparison', label: 'Comparison', panel: <Comparison /> },
            {
                value: 'conditionalFormatting',
                label: 'Conditional formatting',
                panel: <BigNumberConditionalFormatting />,
            },
        ]}
    />
));
