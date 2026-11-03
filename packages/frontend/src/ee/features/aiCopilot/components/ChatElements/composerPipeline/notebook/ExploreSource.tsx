import { friendlyName } from '@lightdash/common';
import { Group, HoverCard, ScrollArea, Text } from '@mantine/core';
import { IconTable } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../../../../../components/common/MantineIcon';
import { ItemDetailMarkdown } from '../../../../../../../components/Explorer/ExploreTree/TableTree/ItemDetailPreview';
import styles from './PipelineNotebook.module.css';
import { useNodeExplore } from './useNodeExplore';

/** The explore a cell reads, with its description on hover. */
export const ExploreSource: FC<{
    exploreName: string;
    projectUuid: string;
}> = ({ exploreName, projectUuid }) => {
    const explore = useNodeExplore(exploreName, projectUuid);
    const label = explore?.label ?? friendlyName(exploreName);
    const description = explore?.tables[explore.baseTable]?.description;
    return (
        <HoverCard
            openDelay={300}
            keepMounted={false}
            withArrow
            disabled={!description}
            position="top"
        >
            <HoverCard.Target>
                <Group gap={4} wrap="nowrap" miw={0} className={styles.source}>
                    <MantineIcon icon={IconTable} size={14} stroke={1.5} />
                    <Text fz="xs" fw={500} truncate>
                        {label}
                    </Text>
                </Group>
            </HoverCard.Target>
            <HoverCard.Dropdown p="xs" miw={300} maw={400}>
                <ScrollArea.Autosize mah={300}>
                    {description && <ItemDetailMarkdown source={description} />}
                </ScrollArea.Autosize>
            </HoverCard.Dropdown>
        </HoverCard>
    );
};
