import { WarehouseTypes } from '@lightdash/common';
import React, { FC, useMemo, useState } from 'react';
import BigQuery from './Assets/bigquery.png';
import Databricks from './Assets/databricks.png';
import PostgresSql from './Assets/postgresql.png';
import Redshift from './Assets/redshift.png';
import Snowflake from './Assets/snowflake.png';
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
                icon: BigQuery,
            },
            {
                label: 'Databricks',
                key: WarehouseTypes.DATABRICKS,
                icon: Databricks,
            },
            {
                label: 'PostgreSQL',
                key: WarehouseTypes.POSTGRES,
                icon: PostgresSql,
            },
            {
                label: 'Redshift',
                key: WarehouseTypes.REDSHIFT,
                icon: Redshift,
            },
            {
                label: 'Snowflake',
                key: WarehouseTypes.SNOWFLAKE,
                icon: Snowflake,
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
