import { type DepartmentTopContentItem } from '@lightdash/common';
import { Group, Paper, Stack, Text, Title } from '@mantine/core';
import { type FC } from 'react';
import TruncatedText from '../../../../components/common/TruncatedText';

type Props = {
    title: string;
    unit: string; // plural noun for the count, for example "views"
    items: DepartmentTopContentItem[];
};

export const TopContentList: FC<Props> = ({ title, unit, items }) => (
    <Paper p="md">
        <Stack gap="xs">
            <Title order={5}>{title}</Title>
            {items.length === 0 && (
                <Text fz="sm" c="dimmed">
                    Nothing in the last 30 days
                </Text>
            )}
            {items.map((item) => (
                <Group key={item.id} justify="space-between" wrap="nowrap">
                    <TruncatedText maxWidth="60%">{item.name}</TruncatedText>
                    <Text fz="xs" c="dimmed">
                        {item.count} {unit} · {item.distinctPeople}{' '}
                        {item.distinctPeople === 1 ? 'person' : 'people'}
                    </Text>
                </Group>
            ))}
        </Stack>
    </Paper>
);
