import { Box, Group, Image, Radio, SimpleGrid, Text } from '@mantine/core';
import { IconTable } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../common/MantineIcon';
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
            <Radio.Card value="dbt" className={classes.choiceCard}>
                <Group justify="space-between" align="flex-start">
                    <Box className={classes.tileLogo}>
                        <Image src={DbtLogo} alt="" w={18} h={18} />
                    </Box>
                    <Radio.Indicator size="xs" />
                </Group>
                <Text fw={500} size="sm" mt="sm">
                    From my dbt project
                </Text>
                <Text c="dimmed" size="xs">
                    Bring models from a repo or dbt Cloud
                </Text>
            </Radio.Card>
            <Radio.Card value="tables" className={classes.choiceCard}>
                <Group justify="space-between" align="flex-start">
                    <Box className={classes.tileLogo}>
                        <MantineIcon icon={IconTable} size={18} />
                    </Box>
                    <Radio.Indicator size="xs" />
                </Group>
                <Text fw={500} size="sm" mt="sm">
                    From my tables
                </Text>
                <Text c="dimmed" size="xs">
                    We'll draft models for you to review
                </Text>
            </Radio.Card>
        </SimpleGrid>
    </Radio.Group>
);
