import { type FC } from 'react';
import useEmbed from '../../ee/providers/Embed/useEmbed';

type Props = {
    title?: string;
};

const APP_NAME = 'Lightdash';
const PREFIX = import.meta.env.DEV ? '(DEV) ' : '';

export const DocumentTitle: FC<Props> = ({ title }) => {
    // The SDK renders inside the host's document, whose title is not ours.
    const { mode } = useEmbed();
    if (mode === 'sdk') {
        return null;
    }

    const fullTitle = title
        ? `${PREFIX}${title} - ${APP_NAME}`
        : `${PREFIX}${APP_NAME}`;
    return <title>{fullTitle}</title>;
};
