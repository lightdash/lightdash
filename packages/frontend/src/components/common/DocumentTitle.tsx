import { type FC } from 'react';

type Props = {
    title?: string;
};

const APP_NAME = 'Lightdash';
const SUFFIX = import.meta.env.DEV ? ' (DEV)' : '';

export const DocumentTitle: FC<Props> = ({ title }) => {
    const fullTitle = title
        ? `${title} - ${APP_NAME}${SUFFIX}`
        : `${APP_NAME}${SUFFIX}`;
    return <title>{fullTitle}</title>;
};
