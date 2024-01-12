import { ApiPersonalAccessTokenResponse, formatDate } from '@lightdash/common';
import {
    Button,
    Flex,
    Modal,
    Paper,
    Stack,
    Table,
    Text,
    Title,
} from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import { Dispatch, FC, SetStateAction, useEffect, useState } from 'react';
import { useTableStyles } from '../../../hooks/styles/useTableStyles';
import {
    useAccessToken,
    useDeleteAccessToken,
} from '../../../hooks/useAccessToken';
import MantineIcon from '../../common/MantineIcon';

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
                <Text component="td" fw={500}>
                    {description}
                </Text>

                <td>
                    {expiresAt ? formatDate(expiresAt) : 'No expiration date'}
                </td>
                <td width="1%">
                    <Button
                        px="xs"
                        variant="outline"
                        size="xs"
                        color="red"
                        onClick={() => setTokenToDelete(token)}
                    >
                        <MantineIcon icon={IconTrash} />
                    </Button>
                </td>
            </tr>
        </>
    );
};

export const TokensTable = () => {
    const { data } = useAccessToken();

    const { cx, classes } = useTableStyles();

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
                <Table className={cx(classes.root, classes.alignLastTdRight)}>
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
                opened={!!tokenToDelete}
                onClose={() => !isDeleting && setTokenToDelete(undefined)}
                title={
                    <Title order={4}>
                        Delete token {tokenToDelete?.description}
                    </Title>
                }
            >
                <Stack spacing="xl">
                    <Text>
                        Are you sure? This will permanently delete the
                        <Text fw={600} component="span">
                            {' '}
                            {tokenToDelete?.description}{' '}
                        </Text>
                        token.
                    </Text>

                    <Flex gap="sm" justify="flex-end">
                        <Button
                            color="dark"
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
