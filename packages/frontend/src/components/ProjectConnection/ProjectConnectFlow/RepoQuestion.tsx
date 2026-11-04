import { Box, Group, Radio, SimpleGrid, Text } from '@mantine/core';
import { IconBrandGit } from '@tabler/icons-react';
import { type FC } from 'react';
import LogoIcon from '../../../svgs/logo-icon.svg?react';
import MantineIcon from '../../common/MantineIcon';
import classes from './DataSourceChooser.module.css';

export type ModelSource = 'build' | 'repo';

export const RepoQuestion: FC<{
    value: ModelSource;
    onChange: (value: ModelSource) => void;
    canBuildModels: boolean;
}> = ({ value, onChange, canBuildModels }) => (
    <Radio.Group
        label="Do you already have a repo with your models?"
        description="Models turn tables into things your team can ask about, like revenue by month or orders by country, without writing SQL."
        value={value}
        onChange={(next) => onChange(next === 'repo' ? 'repo' : 'build')}
        classNames={{
            label: classes.questionLabel,
            description: classes.questionDescription,
        }}
    >
        <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="xs">
            <Radio.Card value="build" className={classes.choiceCard}>
                <Group gap="sm" wrap="nowrap">
                    <Box className={classes.tileLogo}>
                        <LogoIcon width={16} height={16} />
                    </Box>
                    <Box flex={1} miw={0}>
                        <Text fw={500} size="sm">
                            {canBuildModels
                                ? 'No, build them for me'
                                : 'Not yet'}
                        </Text>
                        <Text c="dimmed" size="xs">
                            {canBuildModels
                                ? "We'll read your tables and draft them in a few minutes"
                                : 'Start from your tables and add models later'}
                        </Text>
                    </Box>
                    <Radio.Indicator size="xs" />
                </Group>
            </Radio.Card>
            <Radio.Card value="repo" className={classes.choiceCard}>
                <Group gap="sm" wrap="nowrap">
                    <Box className={classes.tileLogo}>
                        <MantineIcon icon={IconBrandGit} />
                    </Box>
                    <Box flex={1} miw={0}>
                        <Text fw={500} size="sm">
                            Yes, connect my repo
                        </Text>
                        <Text c="dimmed" size="xs">
                            GitHub, GitLab, Bitbucket or dbt Cloud, with dbt or
                            Lightdash YAML
                        </Text>
                    </Box>
                    <Radio.Indicator size="xs" />
                </Group>
            </Radio.Card>
        </SimpleGrid>
    </Radio.Group>
);
