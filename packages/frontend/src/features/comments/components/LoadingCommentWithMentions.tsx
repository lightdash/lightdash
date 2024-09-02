import { Grid, Group, Skeleton, Stack } from '@mantine/core';

const LoadingCommentWithMentions = () => {
    return (
        <Stack spacing="xs" mt="xs">
            <Grid columns={20}>
                <Grid.Col span={2}>
                    <Skeleton height={30} circle />
                </Grid.Col>
                <Grid.Col span={18} w={350}>
                    <Skeleton h={30} w={'100%'} />
                </Grid.Col>
            </Grid>
            <Group position="right" spacing="xs">
                <Skeleton h={22} w={100} />
            </Group>
        </Stack>
    );
};

export default LoadingCommentWithMentions;
