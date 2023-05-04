import { ApiPersonalAccessTokenResponse, formatDate } from '@lightdash/common';
import {
    Button,
    clsx,
    Flex,
    Modal,
    Paper,
    Stack,
    Table,
    Text,
    Title,
} from '@mantine/core';
import { Dispatch, FC, SetStateAction, useEffect, useState } from 'react';
import { useTableStyles } from '../../../hooks/styles/useTableStyles';
import {
    useAccessToken,
    useDeleteAccessToken,
} from '../../../hooks/useAccessToken';

const TokenItem: FC<{
    token: ApiPersonalAccessTokenResponse;
    setTokenToDelete: Dispatch<
        SetStateAction<ApiPersonalAccessTokenResponse | undefined>
    >;
}> = ({ token, setTokenToDelete }) => {
    const { description, expiresAt } = token;

    return (
        <>
            <tr>
                <td>{description}</td>
                <td>
                    {expiresAt ? formatDate(expiresAt) : 'No expiration date'}
                </td>
                <td>
                    <Button
                        variant="outline"
                        size="xs"
                        color="red"
                        onClick={() => setTokenToDelete(token)}
                    >
                        Delete
                    </Button>
                </td>
            </tr>
        </>
    );
};

export const TokensTable = () => {
    const { data } = useAccessToken();

    const { classes } = useTableStyles();

    const [tokenToDelete, setTokenToDelete] = useState<
        ApiPersonalAccessTokenResponse | undefined
    >();
    const { mutate, isLoading: isDeleting, isSuccess } = useDeleteAccessToken();

    useEffect(() => {
        if (isSuccess) {
            setTokenToDelete(undefined);
        }
    }, [isSuccess]);

    return (
        <>
            <Paper withBorder sx={{ overflow: 'hidden' }}>
                <Table
                    className={clsx(classes.root, classes.alignLastTdRight)}
                    highlightOnHover
                >
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Expiration date</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        {data?.map((token) => (
                            <TokenItem
                                key={token.uuid}
                                token={token}
                                setTokenToDelete={setTokenToDelete}
                            />
                        ))}
                    </tbody>
                </Table>
            </Paper>

            <Modal
                centered
                opened={!!tokenToDelete}
                onClose={() => !isDeleting && setTokenToDelete(undefined)}
                title={
                    <Title order={4}>
                        {`Delete token ${tokenToDelete?.description}`}
                    </Title>
                }
            >
                <Stack mt="md">
                    <Text>
                        Are you sure ? This will permanently delete the
                        <Text component="b">
                            {' '}
                            {tokenToDelete?.description}{' '}
                        </Text>
                        token.
                    </Text>

                    <Flex gap="sm" justify="flex-end">
                        <Button
                            color="gray"
                            variant="outline"
                            disabled={isDeleting}
                            onClick={() => setTokenToDelete(undefined)}
                        >
                            Cancel
                        </Button>
                        <Button
                            color="red"
                            disabled={isDeleting}
                            onClick={() => {
                                mutate(tokenToDelete?.uuid ?? '');
                            }}
                        >
                            Delete
                        </Button>
                    </Flex>
                </Stack>
            </Modal>
        </>
    );
};
