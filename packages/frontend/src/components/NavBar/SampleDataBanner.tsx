import { Anchor, Center, Group, Text } from '@mantine/core';
import { IconArrowRight, IconSparkles } from '@tabler/icons-react';
import { type FC } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../common/MantineIcon';
import { BANNER_HEIGHT } from '../common/Page/constants';
import classes from './PreviewBanner.module.css';

export const SampleDataBanner: FC = () => (
    <Center
        id="sample-data-banner"
        pos="fixed"
        top={0}
        w="100%"
        h={BANNER_HEIGHT}
        bg="indigo.6"
        className={classes.banner}
        px="md"
    >
        <Group gap="xs" wrap="nowrap" miw={0}>
            <MantineIcon icon={IconSparkles} color="white" size="sm" />
            <Text c="white" fw={500} fz="xs" truncate>
                You're exploring sample data.
            </Text>
            <Anchor
                component={Link}
                to="/onboarding/data-source"
                c="white"
                fz="xs"
                fw={600}
                underline="always"
                className={classes.backLink}
            >
                Connect your data
                <MantineIcon icon={IconArrowRight} size="sm" />
            </Anchor>
        </Group>
    </Center>
);
