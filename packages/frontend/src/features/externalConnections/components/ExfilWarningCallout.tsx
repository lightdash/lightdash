import { type FC } from 'react';
import Callout from '../../../components/common/Callout';
import { buildExfilWarning } from '../utils/exfilWarning';

type Props = {
    origin: string;
    allowedMethods: ('GET' | 'POST')[];
};

export const ExfilWarningCallout: FC<Props> = ({ origin, allowedMethods }) => {
    const allowsWrite = allowedMethods.includes('POST');
    return (
        <Callout
            variant={allowsWrite ? 'danger' : 'warning'}
            title="Data leaves Lightdash"
        >
            {buildExfilWarning(origin, allowedMethods)}
        </Callout>
    );
};
