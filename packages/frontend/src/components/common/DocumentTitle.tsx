import { type FC } from 'react';

type Props = {
    title?: string;
};

const APP_NAME = 'Lightdash';
const PREFIX = import.meta.env.DEV ? '(DEV) ' : '';

export const DocumentTitle: FC<Props> = ({ title }) => {
    const fullTitle = title
        ? `${PREFIX}${title} - ${APP_NAME}`
        : `${PREFIX}${APP_NAME}`;
    return <title>{fullTitle}</title>;
};
