import { Box, Divider } from '@mantine/core';
import { type FC } from 'react';
import classes from './CustomerLogos.module.css';
import Adobe from './customerLogos/adobe.svg?react';
import Fal from './customerLogos/fal.svg?react';
import Kraken from './customerLogos/kraken.svg?react';
import OctopusEnergy from './customerLogos/octopus-energy.svg?react';
import Phantom from './customerLogos/phantom.svg?react';
import ServiceNow from './customerLogos/servicenow.svg?react';
import Workday from './customerLogos/workday.svg?react';

const BASE_LOGO_HEIGHT = 18;

const CUSTOMERS = [
    { name: 'ServiceNow', Logo: ServiceNow, aspectRatio: 6.74, weight: 1 },
    { name: 'Adobe', Logo: Adobe, aspectRatio: 3.8, weight: 1 },
    { name: 'Workday', Logo: Workday, aspectRatio: 2.08, weight: 1.1 },
    {
        name: 'Octopus Energy',
        Logo: OctopusEnergy,
        aspectRatio: 7.3,
        weight: 1.1,
    },
    { name: 'Kraken', Logo: Kraken, aspectRatio: 6.12, weight: 0.85 },
    { name: 'fal', Logo: Fal, aspectRatio: 2.5, weight: 0.9 },
    { name: 'Phantom', Logo: Phantom, aspectRatio: 5.04, weight: 1 },
];

const logoHeightEm = (aspectRatio: number, weight: number) =>
    `${Math.round(((BASE_LOGO_HEIGHT * 2) / Math.sqrt(aspectRatio)) * weight) / 16}em`;

const CustomerLogos: FC = () => (
    <Box className={classes.root}>
        <Divider
            label="Trusted by data teams at"
            labelPosition="left"
            classNames={{ root: classes.divider, label: classes.label }}
        />
        <Box component="ul" className={classes.logos}>
            {CUSTOMERS.map(({ name, Logo, aspectRatio, weight }) => (
                <Box component="li" key={name} className={classes.item}>
                    <Logo
                        role="img"
                        aria-label={name}
                        height={logoHeightEm(aspectRatio, weight)}
                        className={classes.logo}
                    />
                </Box>
            ))}
        </Box>
    </Box>
);

export default CustomerLogos;
