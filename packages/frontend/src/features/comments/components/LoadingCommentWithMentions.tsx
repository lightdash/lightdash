import { Flex, Loader, Title } from '@mantine/core';

const LoadingCommentWithMentions = () => {
    return (
        <Flex p={8} gap="xl" mb="md" w={375} justify="center" align="center">
            <Loader size="md" color="gray" />
            <Title order={3} fw={500} color="gray.7">
                Loading...
            </Title>
        </Flex>
    );
};

export default LoadingCommentWithMentions;
