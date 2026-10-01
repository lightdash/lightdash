import { type Space } from '@lightdash/common';
import { type FC } from 'react';
import { NameStep } from '../../../features/namePrompt/NameStep';
import ShareSpaceModalContent from './ShareSpaceModalContent';

export interface ShareSpaceProps {
    space: Space;
    projectUuid: string;
    opened?: boolean;
    onClose?: () => void;
}

const ShareSpaceModal: FC<ShareSpaceProps> = (props) => (
    <NameStep
        trigger="share_space"
        opened={props.opened ?? false}
        onClose={() => props.onClose?.()}
    >
        <ShareSpaceModalContent {...props} />
    </NameStep>
);

export default ShareSpaceModal;
