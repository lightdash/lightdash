import { Flex, Text } from '@mantine/core';
import { Prism } from '@mantine/prism';
import { IconAlertCircle } from '@tabler/icons-react';
import React, { type ComponentProps, type FC } from 'react';
import SuboptimalState from '../../../components/common/SuboptimalState/SuboptimalState';

export const ErrorBoundaryMessage: FC<{
    eventId: string;
    error: Error;
    wrapper?: ComponentProps<typeof Flex>;
}> = ({ eventId, error, wrapper }) => {
    return (
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
                            Please contact support with the following details:
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
    );
};
