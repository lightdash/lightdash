import { Accordion } from '@mantine/core';
import { memo } from 'react';
import { getAccordionConfigTabsStyles } from '../mantineTheme';
import { Comparison } from './BigNumberComparison';
import { Layout } from './BigNumberLayout';

export const ConfigTabs = memo(() => {
    return (
        <Accordion
            radius="none"
            styles={getAccordionConfigTabsStyles}
            defaultValue="layout"
        >
            <Accordion.Item value="layout">
                <Accordion.Control>Layout</Accordion.Control>
                <Accordion.Panel>
                    <Layout />
                </Accordion.Panel>
            </Accordion.Item>
            <Accordion.Item value="comparison">
                <Accordion.Control>Comparison</Accordion.Control>
                <Accordion.Panel>
                    <Comparison />
                </Accordion.Panel>
            </Accordion.Item>
        </Accordion>
    );
});
