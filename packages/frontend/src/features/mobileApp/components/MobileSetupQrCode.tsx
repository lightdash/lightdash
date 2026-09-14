import { Box } from '@mantine/core';
import { type FC } from 'react';
import QRCode from 'react-qr-code';
import classes from './MobileSetupQrCode.module.css';

const QR_SIZE = 220;

type Props = {
    value: string;
};

export const MobileSetupQrCode: FC<Props> = ({ value }) => (
    <Box className={classes.surface}>
        <QRCode
            value={value}
            size={QR_SIZE}
            level="M"
            bgColor="#FFFFFF"
            fgColor="#000000"
            title="Lightdash mobile app setup code"
        />
    </Box>
);
