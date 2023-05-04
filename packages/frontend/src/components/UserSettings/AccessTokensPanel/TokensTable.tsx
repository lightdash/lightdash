import { Button, Classes, Dialog } from '@blueprintjs/core';
import { ApiPersonalAccessTokenResponse, formatDate } from '@lightdash/common';
import { Button as MantineButton, Paper, Table } from '@mantine/core';
import { FC, useState } from 'react';
import { useTableStyles } from '../../../hooks/styles/useTableStyles';
import {
    useAccessToken,
    useDeleteAccessToken,
} from '../../../hooks/useAccessToken';

const TokenItem: FC<{
    token: ApiPersonalAccessTokenResponse;
}> = ({ token }) => {
    const { description, expiresAt, uuid } = token;
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const { mutate, isLoading: isDeleting } = useDeleteAccessToken();

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
                        onClick={() => setIsDeleteDialogOpen(true)}
                    >
                        Delete
                    </MantineButton>
                </td>
            </tr>
            <Dialog
                isOpen={isDeleteDialogOpen}
                icon="delete"
                onClose={() => !isDeleting && setIsDeleteDialogOpen(false)}
                title={`Delete token ${description}`}
                lazy
            >
                <div className={Classes.DIALOG_BODY}>
                    <p>
                        Are you sure ? This will permanently delete the
                        <b> {description} </b> token.
                    </p>
                </div>
                <div className={Classes.DIALOG_FOOTER}>
                    <div className={Classes.DIALOG_FOOTER_ACTIONS}>
                        <Button
                            disabled={isDeleting}
                            onClick={() => setIsDeleteDialogOpen(false)}
                        >
                            Cancel
                        </Button>
                        <Button
                            disabled={isDeleting}
                            intent="danger"
                            onClick={() => {
                                mutate(uuid || '');
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

export const TokensTable = () => {
    const { data } = useAccessToken();
    const { classes } = useTableStyles({
        '& tr td:last-child': {
            textAlign: 'right',
        },
    })();
    return (
        <Paper withBorder sx={{ overflow: 'hidden' }}>
            <Table className={classes.root} highlightOnHover>
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Expiration date</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody>
                    {data?.map((token) => (
                        <TokenItem key={token.uuid} token={token} />
                    ))}
                </tbody>
            </Table>
        </Paper>
    );
};
