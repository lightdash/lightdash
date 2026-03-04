import { type Space } from '@lightdash/common';
import { type FC } from 'react';
import ShareSpaceModalV2 from './v2/ShareSpaceModal';

export interface ShareSpaceProps {
    space: Space;
    projectUuid: string;
    opened?: boolean;
    onClose?: () => void;
}

const ShareSpaceModal: FC<ShareSpaceProps> = (props) => {
    return <ShareSpaceModalV2 {...props} />;
};

export default ShareSpaceModal;
