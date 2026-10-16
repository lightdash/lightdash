import { memo, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { VisualizationConfigTabs } from '../common/VisualizationConfigTabs';
import { ColumnCellDisplay } from './ColumnCellDisplay';
import ConditionalFormattingList from './ConditionalFormattingList';
import GeneralSettings from './GeneralSettings';

export const ConfigTabs: FC = memo(() => {
    const { t } = useTranslation('vizConfig');
    return (
        <VisualizationConfigTabs
            tabs={[
                {
                    value: 'general',
                    label: t('table.tabs.general'),
                    panel: <GeneralSettings />,
                },
                {
                    value: 'conditional-formatting',
                    label: t('table.tabs.conditionalFormatting'),
                    panel: <ConditionalFormattingList />,
                },
                {
                    value: 'cell-display',
                    label: t('table.tabs.cellDisplay'),
                    panel: <ColumnCellDisplay />,
                },
            ]}
        />
    );
});
