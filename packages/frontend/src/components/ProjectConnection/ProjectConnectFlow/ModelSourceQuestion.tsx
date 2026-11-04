import { Box, Group, Image, Radio, SimpleGrid, Text } from '@mantine/core';
import { type FC } from 'react';
import LogoIcon from '../../../svgs/logo-icon.svg?react';
import DbtLogo from './Assets/dbt.svg';
import classes from './DataSourceChooser.module.css';

export type ModelSource = 'dbt' | 'tables';

export const ModelSourceQuestion: FC<{
    value: ModelSource | null;
    onChange: (value: ModelSource) => void;
}> = ({ value, onChange }) => (
    <Radio.Group
        label="How should we set up your models?"
        value={value}
        onChange={(next) => onChange(next === 'dbt' ? 'dbt' : 'tables')}
        classNames={{ label: classes.questionLabel }}
    >
        <SimpleGrid cols={2} spacing="xs">
            <Radio.Card value="tables" className={classes.choiceCard}>
                <Group justify="space-between" align="flex-start">
                    <Box className={classes.tileLogo}>
                        <LogoIcon width={16} height={16} />
                    </Box>
                    <Radio.Indicator size="xs" />
                </Group>
                <Text fw={500} size="sm" mt="sm">
                    Let us handle it
                </Text>
                <Text c="dimmed" size="xs">
                    We'll draft models from your tables
                </Text>
            </Radio.Card>
            <Radio.Card value="dbt" className={classes.choiceCard}>
                <Group justify="space-between" align="flex-start">
                    <Box className={classes.tileLogo}>
                        <Image src={DbtLogo} alt="" w={18} h={18} />
                    </Box>
                    <Radio.Indicator size="xs" />
                </Group>
                <Text fw={500} size="sm" mt="sm">
                    I have a dbt project
                </Text>
                <Text c="dimmed" size="xs">
                    Bring models from a repo or dbt Cloud
                </Text>
            </Radio.Card>
        </SimpleGrid>
    </Radio.Group>
);
