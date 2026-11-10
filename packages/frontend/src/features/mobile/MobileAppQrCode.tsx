import { QRCodeSVG } from 'qrcode.react';
import { type FC } from 'react';
import { MOBILE_STRINGS } from './mobileStrings';

const MobileAppQrCode: FC<{ value: string; label?: string }> = ({
    value,
    label = MOBILE_STRINGS.qrCodeLabel,
}) => (
    <QRCodeSVG
        value={value}
        size={136}
        marginSize={0}
        role="img"
        aria-label={label}
    />
);

export default MobileAppQrCode;
