import { memo, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { VisualizationConfigTabs } from '../common/VisualizationConfigTabs';
import { Comparison } from './BigNumberComparison';
import { BigNumberConditionalFormatting } from './BigNumberConditionalFormatting';
import { Layout } from './BigNumberLayout';

export const ConfigTabs: FC = memo(() => {
    const { t } = useTranslation('vizConfig');
    return (
        <VisualizationConfigTabs
            tabs={[
                {
                    value: 'layout',
                    label: t('bigNumber.tabs.layout'),
                    panel: <Layout />,
                },
                {
                    value: 'comparison',
                    label: t('bigNumber.tabs.comparison'),
                    panel: <Comparison />,
                },
                {
                    value: 'conditionalFormatting',
                    label: t('bigNumber.tabs.conditionalFormatting'),
                    panel: <BigNumberConditionalFormatting />,
                },
            ]}
        />
    );
});
