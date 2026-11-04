import { Box, Group, Image, Radio, SimpleGrid, Text } from '@mantine/core';
import { type FC } from 'react';
import LogoIcon from '../../../svgs/logo-icon.svg?react';
import DbtLogo from './Assets/dbt.svg';
import classes from './DataSourceChooser.module.css';

export type ModelSource = 'dbt' | 'tables';

export const ModelSourceQuestion: FC<{
    value: ModelSource;
    onChange: (value: ModelSource) => void;
}> = ({ value, onChange }) => (
    <Radio.Group
        label="How should we set up your models?"
        description="Models turn tables into things your team can ask about, like revenue by month or orders by country, without writing SQL."
        value={value}
        onChange={(next) => onChange(next === 'dbt' ? 'dbt' : 'tables')}
        classNames={{
            label: classes.questionLabel,
            description: classes.questionDescription,
        }}
    >
        <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="xs">
            <Radio.Card value="tables" className={classes.choiceCard}>
                <Group gap="sm" wrap="nowrap">
                    <Box className={classes.tileLogo}>
                        <LogoIcon width={16} height={16} />
                    </Box>
                    <Box flex={1} miw={0}>
                        <Text fw={500} size="sm">
                            Let us handle it
                        </Text>
                        <Text c="dimmed" size="xs">
                            We'll read your tables and draft them in a few
                            minutes
                        </Text>
                    </Box>
                    <Radio.Indicator size="xs" />
                </Group>
            </Radio.Card>
            <Radio.Card value="dbt" className={classes.choiceCard}>
                <Group gap="sm" wrap="nowrap">
                    <Box className={classes.tileLogo}>
                        <Image src={DbtLogo} alt="" w={18} h={18} />
                    </Box>
                    <Box flex={1} miw={0}>
                        <Text fw={500} size="sm">
                            I have a dbt project
                        </Text>
                        <Text c="dimmed" size="xs">
                            Use the models you already have, from a repo or dbt
                            Cloud
                        </Text>
                    </Box>
                    <Radio.Indicator size="xs" />
                </Group>
            </Radio.Card>
        </SimpleGrid>
    </Radio.Group>
);
