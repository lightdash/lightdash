import { QRCodeSVG } from 'qrcode.react';
import { type FC } from 'react';

const MobileAppQrCode: FC<{ value: string }> = ({ value }) => (
    <QRCodeSVG
        value={value}
        size={136}
        marginSize={0}
        role="img"
        aria-label="QR code to install the Lightdash app"
    />
);

export default MobileAppQrCode;
