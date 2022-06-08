import { WarehouseTypes } from '@lightdash/common';
import React, { FC, useMemo, useState } from 'react';
import {
    ConnectWarehouseWrapper,
    ExternalLink,
    Subtitle,
    Title,
    WarehouseButton,
    WarehouseGrid,
    WarehouseIcon,
    Wrapper,
} from './ProjectConnectFlow.styles';
export type SelectedWarehouse = {
    label: string;
    key: WarehouseTypes;
    icon: string;
};
interface Props {
    setWarehouse: (warehouse: SelectedWarehouse) => void;
}

const WareHouseConnectCard: FC<Props> = ({ setWarehouse }) => {
    const [warehouseInfo, setWarehouseInfo] = useState<
        SelectedWarehouse[] | undefined
    >();

    useMemo(() => {
        const WarehouseTypeLabels = [
            {
                label: 'BigQuery',
                key: WarehouseTypes.BIGQUERY,
                icon: './bigquery.png',
            },
            {
                label: 'Databricks',
                key: WarehouseTypes.DATABRICKS,
                icon: './databricks.png',
            },
            {
                label: 'PostgreSQL',
                key: WarehouseTypes.POSTGRES,
                icon: './postgresql.png',
            },
            {
                label: 'Redshift',
                key: WarehouseTypes.REDSHIFT,
                icon: './redshift.png',
            },
            {
                label: 'Snowflake',
                key: WarehouseTypes.SNOWFLAKE,
                icon: './snowflake.png',
            },
        ];
        setWarehouseInfo(WarehouseTypeLabels);
    }, []);

    return (
        <Wrapper>
            <ConnectWarehouseWrapper>
                <Title>Connect your project</Title>
                <Subtitle>Select your warehouse:</Subtitle>
                <WarehouseGrid>
                    {warehouseInfo?.map((item) => (
                        <WarehouseButton
                            key={item.key}
                            outlined
                            icon={
                                <WarehouseIcon src={item.icon} alt={item.key} />
                            }
                            onClick={() => setWarehouse(item)}
                        >
                            {item.label}
                        </WarehouseButton>
                    ))}
                </WarehouseGrid>
                <ExternalLink
                    href="https://demo.lightdash.com/"
                    target="_blank"
                >
                    ...or try our demo project instead
                </ExternalLink>
            </ConnectWarehouseWrapper>
        </Wrapper>
    );
};
export default WareHouseConnectCard;
