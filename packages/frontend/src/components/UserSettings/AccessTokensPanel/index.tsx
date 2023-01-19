import {
    Button,
    ButtonGroup,
    Classes,
    Dialog,
    Intent,
    NonIdealState,
} from '@blueprintjs/core';
import { ApiPersonalAccessTokenResponse, formatDate } from '@lightdash/common';
import React, { FC, useState } from 'react';
import {
    useAccessToken,
    useDeleteAccessToken,
} from '../../../hooks/useAccessToken';
import CreateTokenPanel from '../CreateTokenPanel';
import {
    AccessTokenInfo,
    AccessTokenLabel,
    AccessTokensPanelWrapper,
    AccessTokenWrapper,
    ExpireAtLabel,
    HeaderActions,
    ItemContent,
    NoTokensWrapper,
    PanelTitle,
} from './AccessTokens.styles';

const TokenListItem: FC<{
    token: ApiPersonalAccessTokenResponse;
}> = ({ token }) => {
    const { description, expiresAt, uuid } = token;
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const { mutate, isLoading: isDeleting } = useDeleteAccessToken();
    return (
        <AccessTokenWrapper elevation={0}>
            <ItemContent>
                <AccessTokenInfo>
                    <AccessTokenLabel
                        className={Classes.TEXT_OVERFLOW_ELLIPSIS}
                    >
                        {description}
                    </AccessTokenLabel>
                    <ExpireAtLabel intent={expiresAt ? 'warning' : 'none'}>
                        {expiresAt
                            ? `Expires on ${formatDate(expiresAt)}`
                            : 'No expiration date'}
                    </ExpireAtLabel>
                </AccessTokenInfo>
                <ButtonGroup>
                    <Button
                        icon="delete"
                        outlined
                        text="Delete"
                        intent={Intent.DANGER}
                        style={{ marginLeft: 10 }}
                        onClick={() => setIsDeleteDialogOpen(true)}
                    />
                </ButtonGroup>
            </ItemContent>
            <Dialog
                isOpen={isDeleteDialogOpen}
                icon="delete"
                onClose={() =>
                    !isDeleting ? setIsDeleteDialogOpen(false) : undefined
                }
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
        </AccessTokenWrapper>
    );
};

const AccessTokensPanel: FC = () => {
    const { data } = useAccessToken();
    const [createTokenPanel, setCreateInvitesPanel] = useState(false);
    const hasAvailableTokens = data && data?.length > 0;
    if (createTokenPanel) {
        return (
            <CreateTokenPanel
                onBackClick={() => setCreateInvitesPanel(false)}
            />
        );
    }

    return (
        <AccessTokensPanelWrapper>
            {hasAvailableTokens && (
                <HeaderActions>
                    <PanelTitle>Personal access tokens</PanelTitle>
                    <Button
                        intent="primary"
                        onClick={() => setCreateInvitesPanel(true)}
                        text="Generate new token"
                    />
                </HeaderActions>
            )}
            {hasAvailableTokens ? (
                <div>
                    {data?.map((token) => (
                        <TokenListItem key={token.uuid} token={token} />
                    ))}
                </div>
            ) : (
                <NoTokensWrapper>
                    <NonIdealState
                        icon="key"
                        title="No tokens"
                        description="You haven't generated any tokens yet!, generate your first token"
                        action={
                            <HeaderActions>
                                <Button
                                    intent="primary"
                                    onClick={() => setCreateInvitesPanel(true)}
                                    text="Generate token"
                                />
                            </HeaderActions>
                        }
                    />
                </NoTokensWrapper>
            )}
        </AccessTokensPanelWrapper>
    );
};

export default AccessTokensPanel;
