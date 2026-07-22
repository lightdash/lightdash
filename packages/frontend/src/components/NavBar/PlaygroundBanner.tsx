import { Anchor, Center, Group, Text } from '@mantine-8/core';
import { IconArrowRight, IconFlask } from '@tabler/icons-react';
import { type FC } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../common/MantineIcon';
import { BANNER_HEIGHT } from '../common/Page/constants';
import classes from './PlaygroundBanner.module.css';

export const PlaygroundBanner: FC = () => (
    <Center
        id="playground-banner"
        pos="fixed"
        top={0}
        w="100%"
        h={BANNER_HEIGHT}
        bg="violet.6"
        className={classes.banner}
        px="md"
    >
        <Group gap="xs" wrap="nowrap" miw={0}>
            <MantineIcon icon={IconFlask} color="white" size="sm" />
            <Text c="white" fw={500} fz="xs" truncate>
                You're exploring sample data — this isn't your company's data.
            </Text>
            <Anchor
                component={Link}
                to="/onboarding/data-source"
                c="white"
                fz="xs"
                fw={600}
                underline="always"
                className={classes.connectLink}
            >
                <Text span fz="xs" fw={600}>
                    Connect your warehouse
                </Text>
                <MantineIcon icon={IconArrowRight} size="sm" />
            </Anchor>
        </Group>
    </Center>
);
