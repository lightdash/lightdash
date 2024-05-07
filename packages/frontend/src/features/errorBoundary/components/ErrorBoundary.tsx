import { Box, Flex, Text, type FlexProps } from '@mantine/core';
import { Prism } from '@mantine/prism';
import * as Sentry from '@sentry/react';
import { IconAlertCircle } from '@tabler/icons-react';
import { type FC, type PropsWithChildren } from 'react';
import SuboptimalState from '../../../components/common/SuboptimalState/SuboptimalState';

export const ErrorBoundary: FC<PropsWithChildren & { wrapper?: FlexProps }> = ({
    children,
    wrapper,
}) => {
    return (
        <Sentry.ErrorBoundary
            fallback={({ eventId, error }) => (
                <Flex
                    justify="flex-start"
                    align="center"
                    direction="column"
                    {...wrapper}
                >
                    <SuboptimalState
                        icon={IconAlertCircle}
                        title="You have encountered an error."
                        description={
                            <Box
                                sx={(theme) => ({
                                    borderRadius: theme.radius.md,
                                    padding: theme.spacing.xs,
                                    backgroundColor: theme.colors.gray[1],
                                })}
                            >
                                <Text>
                                    Please contact support with the following
                                    details:
                                </Text>
                                <Prism
                                    language="javascript"
                                    ta="left"
                                    maw="400"
                                    styles={{ copy: { right: 0 } }}
                                >
                                    {`Error ID: ${eventId}\n${error.toString()}`}
                                </Prism>
                            </Box>
                        }
                    />
                </Flex>
            )}
        >
            {children}
        </Sentry.ErrorBoundary>
    );
};
