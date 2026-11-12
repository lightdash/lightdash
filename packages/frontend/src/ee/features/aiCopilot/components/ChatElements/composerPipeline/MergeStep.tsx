import { interpolateUiString } from '@lightdash/common';
import { Group, Stack, Text } from '@mantine/core';
import { IconArrowsJoin, IconStack2 } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../../../../components/common/MantineIcon';
import { useUiStrings } from '../../../../../providers/Embed/useUiStrings';
import styles from './MergeStep.module.css';
import { MergeOutputRows, MergeSentence } from './MergeStepParts';
import { type MergeNodeView } from './notebook/useMergeNodeView';
import { DetailsRow } from './SemanticNodeDetails';

/** The cell's title, as a semantic cell names its explore. */
export const MergeStepTitle: FC<{ view: MergeNodeView }> = ({ view }) => {
    const getUiString = useUiStrings();
    return (
        <Group gap={4} wrap="nowrap" miw={0} className={styles.title}>
            <MantineIcon icon={IconArrowsJoin} size={14} stroke={1.5} />
            <Text fz="xs" fw={500}>
                {getUiString('aiAgent.composer.mergeNode.title')}
            </Text>
            <Text fz="xs" c="dimmed">
                {interpolateUiString(
                    getUiString('aiAgent.composer.mergeNode.stepCount'),
                    { count: view.summary.sources.length },
                )}
            </Text>
        </Group>
    );
};

/** The join as a sentence, then calculations, sort and limit. */
export const MergeStepBody: FC<{ view: MergeNodeView }> = ({ view }) => {
    const getUiString = useUiStrings();
    return (
        <Stack gap={6}>
            <DetailsRow
                icon={IconStack2}
                label={getUiString('aiAgent.composer.mergeNode.sources')}
            >
                <MergeSentence view={view} />
            </DetailsRow>
            <MergeOutputRows summary={view.summary} />
        </Stack>
    );
};
