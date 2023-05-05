import { Button, Classes, Dialog } from '@blueprintjs/core';
import { ApiPersonalAccessTokenResponse, formatDate } from '@lightdash/common';
import { Button as MantineButton, Paper, Table } from '@mantine/core';
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
                    <MantineButton
                        variant="outline"
                        size="xs"
                        color="red"
                        onClick={() => setTokenToDelete(token)}
                    >
                        Delete
                    </MantineButton>
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
                    className={`${classes.root} ${classes.alignLastTdRight}`}
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
            <Dialog
                isOpen={!!tokenToDelete}
                icon="delete"
                onClose={() => !isDeleting && setTokenToDelete(undefined)}
                title={`Delete token ${tokenToDelete?.description}`}
                lazy
            >
                <div className={Classes.DIALOG_BODY}>
                    <p>
                        Are you sure ? This will permanently delete the
                        <b> {tokenToDelete?.description} </b> token.
                    </p>
                </div>
                <div className={Classes.DIALOG_FOOTER}>
                    <div className={Classes.DIALOG_FOOTER_ACTIONS}>
                        <Button
                            disabled={isDeleting}
                            onClick={() => setTokenToDelete(undefined)}
                        >
                            Cancel
                        </Button>
                        <Button
                            disabled={isDeleting}
                            intent="danger"
                            onClick={() => {
                                mutate(tokenToDelete?.uuid ?? '');
                            }}
                        >
                            Delete
                        </Button>
                    </div>
                </div>
            </Dialog>
        </>
    );
};
