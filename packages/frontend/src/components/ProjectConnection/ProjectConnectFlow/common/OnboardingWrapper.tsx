import { Flex } from '@mantine/core';
import { FC } from 'react';

const OnboardingWrapper: FC<React.PropsWithChildren<{}>> = ({ children }) => {
    return (
        <Flex
            pos="relative"
            direction="column"
            w={420}
            sx={{ flexGrow: 1 }}
            mt="6xl"
            mx="auto"
        >
            {children}
        </Flex>
    );
};

export default OnboardingWrapper;
