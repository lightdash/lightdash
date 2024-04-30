import { Flex, Text } from '@mantine/core';
import { Prism } from '@mantine/prism';
import * as Sentry from '@sentry/react';
import { IconAlertCircle } from '@tabler/icons-react';
import React, {
    type ComponentProps,
    type FC,
    type PropsWithChildren,
} from 'react';
import SuboptimalState from '../../../components/common/SuboptimalState/SuboptimalState';

export const ErrorBoundary: FC<
    PropsWithChildren & { wrapper?: ComponentProps<typeof Flex> }
> = ({ children, wrapper }) => {
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
                            <>
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
                            </>
                        }
                    />
                </Flex>
            )}
        >
            {children}
        </Sentry.ErrorBoundary>
    );
};
