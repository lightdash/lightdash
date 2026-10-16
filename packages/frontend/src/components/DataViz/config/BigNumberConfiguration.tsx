import { type VizColumn } from '@lightdash/common';
import { Tabs } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { BigNumberComparisonConfig } from './BigNumberComparisonConfig';
import { BigNumberConditionalFormatting } from './BigNumberConditionalFormatting';
import { BigNumberDataConfig } from './BigNumberDataConfig';
import { BigNumberDisplayConfig } from './BigNumberDisplayConfig';

export const BigNumberConfiguration = ({
    columns,
    colors,
}: {
    columns: VizColumn[];
    colors: string[];
}) => {
    const { t } = useTranslation('dataViz');
    return (
        <Tabs defaultValue="data" keepMounted={false}>
            <Tabs.List mb="md">
                <Tabs.Tab value="data">{t('bigNumber.tabs.data')}</Tabs.Tab>
                <Tabs.Tab value="display">
                    {t('bigNumber.tabs.display')}
                </Tabs.Tab>
                <Tabs.Tab value="comparison">
                    {t('bigNumber.tabs.comparison')}
                </Tabs.Tab>
                <Tabs.Tab value="formatting">
                    {t('bigNumber.tabs.formatting')}
                </Tabs.Tab>
            </Tabs.List>

            <Tabs.Panel value="data">
                <BigNumberDataConfig columns={columns} />
            </Tabs.Panel>

            <Tabs.Panel value="display">
                <BigNumberDisplayConfig />
            </Tabs.Panel>

            <Tabs.Panel value="comparison">
                <BigNumberComparisonConfig columns={columns} />
            </Tabs.Panel>

            <Tabs.Panel value="formatting">
                <BigNumberConditionalFormatting colors={colors} />
            </Tabs.Panel>
        </Tabs>
    );
};
