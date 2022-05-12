import React, { FC } from 'react';
import { useApp } from '../../providers/AppProvider';
import { ShareLink } from './ShareLinkButton.styles';

const ShareLinktButton: FC = () => {
    const { showToastSuccess } = useApp();

    const onClick = () => {
        const linkToShare = window.location.href;
        navigator.clipboard.writeText(linkToShare).then(() => {
            showToastSuccess({
                title: 'Link copied to clipboard',
            });
        });
    };

    return <ShareLink icon="link" onClick={onClick} />;
};

export default ShareLinktButton;
