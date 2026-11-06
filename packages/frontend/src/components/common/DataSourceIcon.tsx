import { type ApiConnectorType } from '@lightdash/common';
import { Image, type MantineColor } from '@mantine/core';
import { IconBroadcast, IconFileTypeCsv } from '@tabler/icons-react';
import { type FC } from 'react';
import { getLiveSource } from '../../features/externalConnections/liveSources/liveSourceCatalog';
import googleSheetsLogo from '../../svgs/google-sheets.svg';
import MantineIcon from './MantineIcon';

/** A source that has its own icon: an external source or a live data source. */
export type DataSourceIconSource =
    | { type: 'csv' }
    | { type: 'sheets' }
    /** `integration` is missing when the viewer can't see which one it is. */
    | { type: 'live'; integration: ApiConnectorType | null | undefined };

type Props = {
    source: DataSourceIconSource;
    size?: number;
    /** Colour of the generic icons; integration logos keep their own. */
    color?: MantineColor;
};

const Logo: FC<{ src: string; size: number }> = ({ src, size }) => (
    <Image src={src} alt="" w={size} h={size} fit="contain" flex="none" />
);

/** The same icon for a source on the Semantic Layer page and the Explore page. */
export const DataSourceIcon: FC<Props> = ({
    source,
    size = 16,
    color = 'dimmed',
}) => {
    switch (source.type) {
        case 'csv':
            return (
                <MantineIcon icon={IconFileTypeCsv} size={size} color={color} />
            );
        case 'sheets':
            return <Logo src={googleSheetsLogo} size={size} />;
        case 'live':
            return source.integration ? (
                <Logo
                    src={getLiveSource(source.integration).icon}
                    size={size}
                />
            ) : (
                <MantineIcon icon={IconBroadcast} size={size} color={color} />
            );
        default:
            return null;
    }
};
