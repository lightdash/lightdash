import { type DepartmentTopContentItem } from '@lightdash/common';
import { Group, Paper, Stack, Text, Title } from '@mantine/core';
import { type FC } from 'react';
import TruncatedText from '../../../../components/common/TruncatedText';
import { formatTopContentUsage, type Noun } from '../utils/departmentDetail';

type Props = {
    title: string;
    noun: Noun; // what the count counts, for example views
    items: DepartmentTopContentItem[];
};

export const TopContentList: FC<Props> = ({ title, noun, items }) => (
    <Paper p="md">
        <Stack gap="xs">
            <Title order={5}>{title}</Title>
            {items.length === 0 && (
                <Text fz="sm" c="dimmed">
                    Nothing in the last 30 days
                </Text>
            )}
            {items.map((item) => (
                <Group
                    key={item.id}
                    justify="space-between"
                    wrap="nowrap"
                    gap="sm"
                >
                    {/* The name gives up width first; the count stays on one line */}
                    <TruncatedText
                        maxWidth="100%"
                        style={{ flex: 1, minWidth: 0 }}
                    >
                        {item.name}
                    </TruncatedText>
                    <Text
                        fz="xs"
                        c="dimmed"
                        style={{ whiteSpace: 'nowrap', flexShrink: 0 }}
                    >
                        {formatTopContentUsage(item, noun)}
                    </Text>
                </Group>
            ))}
        </Stack>
    </Paper>
);
