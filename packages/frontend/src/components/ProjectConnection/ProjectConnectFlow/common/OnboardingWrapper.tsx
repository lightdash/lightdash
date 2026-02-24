import { Flex } from '@mantine-8/core';
import { type FC } from 'react';

const OnboardingWrapper: FC<React.PropsWithChildren<{}>> = ({ children }) => {
    return (
        <Flex
            pos="relative"
            direction="column"
            w={420}
            flex={1}
            mt="6xl"
            mx="auto"
        >
            {children}
        </Flex>
    );
};

export default OnboardingWrapper;
