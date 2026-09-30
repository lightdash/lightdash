import { Box, Group, Text } from '@mantine/core';
import { IconSparkles } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../MantineIcon';
import classes from './BrandPrompt.module.css';

const BrandPrompt: FC = () => (
    <Group gap="xs" wrap="nowrap" className={classes.prompt} aria-hidden>
        <MantineIcon icon={IconSparkles} color="ldBrandViolet.2" />
        <Text fz="sm" className={classes.text}>
            Chart total revenue by month
        </Text>
        <Box className={classes.caret} />
    </Group>
);

export default BrandPrompt;
