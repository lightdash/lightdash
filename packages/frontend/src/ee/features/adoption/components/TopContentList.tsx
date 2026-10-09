import { type DepartmentTopContentItem } from '@lightdash/common';
import { Anchor, Group, Paper, Stack, Text, Title } from '@mantine/core';
import { type FC } from 'react';
import { Link } from 'react-router';
import {
    formatTopContentUsage,
    getTopContentPath,
    type TopContentKind,
} from '../utils/departmentDetail';
import { type Noun } from '../utils/format';
import styles from './TopContentList.module.css';

type Props = {
    title: string;
    kind: TopContentKind;
    noun: Noun; // what the count counts, for example views
    items: DepartmentTopContentItem[];
};

export const TopContentList: FC<Props> = ({ title, kind, noun, items }) => (
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
                    {/* The name gives up width first, with the whole name in its title; the count stays on one line */}
                    <Anchor
                        component={Link}
                        to={getTopContentPath(kind, item)}
                        fz="sm"
                        truncate="end"
                        title={item.name}
                        miw={0}
                        flex={1}
                    >
                        {item.name}
                    </Anchor>
                    <Text
                        fz="xs"
                        c="dimmed"
                        flex="none"
                        className={styles.usage}
                    >
                        {formatTopContentUsage(item, noun)}
                    </Text>
                </Group>
            ))}
        </Stack>
    </Paper>
);
