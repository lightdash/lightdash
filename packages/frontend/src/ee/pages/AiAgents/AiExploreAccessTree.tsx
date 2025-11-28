import { type AiAgentExploreAccessSummary } from '@lightdash/common';
import { Group, Stack, Text, Tree, type TreeNodeData } from '@mantine-8/core';
import { IconChevronDown, IconChevronRight } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';

const convertToTree = (exploreAccessSummary: AiAgentExploreAccessSummary[]) => {
    return exploreAccessSummary.map<TreeNodeData>((e) => ({
        label: e.exploreName,
        value: e.exploreName,
        nodeProps: { uuid: e.exploreName, joinedTables: e.joinedTables },
        children: [
            {
                label: 'Dimensions',
                value: `${e.exploreName}.dimensions`,
                nodeProps: { uuid: `${e.exploreName}.dimensions` },
                children: e.dimensions.map<TreeNodeData>((d) => ({
                    label: d,
                    value: `${e.exploreName}.dimensions.${d}`,
                    nodeProps: { uuid: `${e.exploreName}.dimensions.${d}` },
                })),
            },
            {
                label: 'Metrics',
                value: `${e.exploreName}.metrics`,
                nodeProps: { uuid: `${e.exploreName}.metrics` },
                children: e.metrics.map<TreeNodeData>((m) => ({
                    label: m,
                    value: `${e.exploreName}.metrics.${m}`,
                    nodeProps: { uuid: `${e.exploreName}.metrics.${m}` },
                })),
            },
        ],
    }));
};

type Props = {
    exploreAccessSummary: AiAgentExploreAccessSummary[];
};

const AiExploreAccessTree: FC<Props> = ({ exploreAccessSummary }) => {
    return (
        <Tree
            data={convertToTree(exploreAccessSummary)}
            renderNode={({
                node,
                expanded,
                hasChildren,
                level,
                elementProps,
            }) => (
                <Stack gap="two">
                    <Group gap="xxs" {...elementProps}>
                        {level === 1 || level === 2 ? (
                            <MantineIcon
                                color={hasChildren ? 'ldGray.9' : 'ldGray.5'}
                                icon={
                                    expanded
                                        ? IconChevronDown
                                        : IconChevronRight
                                }
                                size="sm"
                            />
                        ) : null}

                        <Text
                            size="sm"
                            fw={level === 1 ? 600 : level === 2 ? 500 : 400}
                        >
                            {node.label}{' '}
                            {level === 1 &&
                                `(${
                                    node.children
                                        ?.flatMap(
                                            (c) => c.children?.length ?? 0,
                                        )
                                        .reduce((a, b) => a + b, 0) ?? 0
                                })`}
                            {level === 2 && `(${node.children?.length ?? 0})`}
                        </Text>
                    </Group>
                    {expanded &&
                    level === 1 &&
                    node.nodeProps?.joinedTables &&
                    node.nodeProps?.joinedTables.length > 0 ? (
                        <Text size="xs" c="dimmed" pl="sm">
                            Joins{' '}
                            <Text span fw={500}>
                                {node.nodeProps?.joinedTables.join(', ')}
                            </Text>
                        </Text>
                    ) : null}
                </Stack>
            )}
        />
    );
};

export default AiExploreAccessTree;
