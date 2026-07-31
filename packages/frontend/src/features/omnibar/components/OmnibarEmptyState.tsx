import { Center, Loader, Stack, Text, ThemeIcon } from '@mantine-8/core';
import { IconSearch, IconSearchOff } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import classes from './OmnibarEmptyState.module.css';

type Props = {
    title: string;
    hint?: string;
    variant?: 'search' | 'no-results' | 'loading';
};

const OmnibarEmptyState: FC<Props> = ({ title, hint, variant = 'search' }) => {
    return (
        <Center py="xl" h="100%">
            <Stack gap="xs" align="center" maw={320}>
                {variant === 'loading' ? (
                    <Loader size="sm" color="ldGray.5" />
                ) : (
                    <ThemeIcon
                        size={40}
                        radius="xl"
                        variant="light"
                        color="gray"
                        className={classes.iconCircle}
                    >
                        <MantineIcon
                            icon={
                                variant === 'no-results'
                                    ? IconSearchOff
                                    : IconSearch
                            }
                            size="lg"
                            strokeWidth={1.5}
                        />
                    </ThemeIcon>
                )}
                <Text size="sm" fw={500} ta="center" className={classes.title}>
                    {title}
                </Text>
                {hint ? (
                    <Text size="xs" ta="center" className={classes.hint}>
                        {hint}
                    </Text>
                ) : null}
            </Stack>
        </Center>
    );
};

export default OmnibarEmptyState;
