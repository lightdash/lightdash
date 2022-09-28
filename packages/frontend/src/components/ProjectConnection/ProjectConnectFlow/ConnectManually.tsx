import { AnchorButton, Button, Intent, Position } from '@blueprintjs/core';
import { Tooltip2 } from '@blueprintjs/popover2';
import { FC, useState } from 'react';
import { CreateProjectConnection } from '..';
import {
    BackToWarehouseButton,
    CreateHeaderWrapper,
    CreateProjectWrapper,
} from '../../../pages/CreateProject.styles';
import {
    ButtonsWrapper,
    Codeblock,
    ConnectWarehouseWrapper,
    Subtitle,
    Title,
    Wrapper,
} from './ProjectConnectFlow.styles';
import WareHouseConnectCard, {
    SelectedWarehouse,
} from './WareHouseConnectCard.tsx';

const codeBlock = String.raw`models:
- name: my_model
    columns:
    - name: my_column_1
    - name: my_column_2
`;

interface DimensionCardProps {
    needsProject: boolean;
    onChangeHasDimensions: (hasDimensions: boolean) => void;
}

const DimensionCard: FC<DimensionCardProps> = ({
    needsProject,
    onChangeHasDimensions,
}) => {
    const handleSubmit = () => {
        onChangeHasDimensions(true);
    };

    return (
        <Wrapper>
            <ConnectWarehouseWrapper>
                {needsProject ? (
                    <Title>You're in! 🎉</Title>
                ) : (
                    <Title>Connect new project</Title>
                )}

                <Subtitle>
                    We strongly recommend that you define columns in your .yml
                    to see a table in Lightdash. eg:
                </Subtitle>

                <Codeblock>
                    <pre>{codeBlock}</pre>
                </Codeblock>

                <ButtonsWrapper>
                    <Tooltip2
                        position={Position.TOP}
                        content={
                            'Add the columns you want to explore to your .yml files in your dbt project. Click to view docs.'
                        }
                        targetTagName="div"
                    >
                        <AnchorButton
                            large
                            minimal
                            outlined
                            fill
                            href="https://docs.lightdash.com/guides/how-to-create-dimensions"
                            target="_blank"
                            rightIcon="chevron-right"
                        >
                            Learn how to define them
                        </AnchorButton>
                    </Tooltip2>
                </ButtonsWrapper>

                <Button
                    type="submit"
                    large
                    intent={Intent.PRIMARY}
                    text="I’ve defined them!"
                    onClick={handleSubmit}
                />
            </ConnectWarehouseWrapper>
        </Wrapper>
    );
};

interface WarehouseSelectedCardProps {
    needsProject: boolean;
    selectedWarehouse: SelectedWarehouse;
    onSelectWarehouse: (warehouse: SelectedWarehouse | undefined) => void;
}

const WarehouseSelectedCard: FC<WarehouseSelectedCardProps> = ({
    needsProject,
    selectedWarehouse,
    onSelectWarehouse,
}) => {
    return (
        <CreateProjectWrapper>
            <CreateHeaderWrapper>
                <BackToWarehouseButton
                    icon="chevron-left"
                    text="Back"
                    onClick={() => onSelectWarehouse(undefined)}
                />

                <Title>
                    {`Create a ${selectedWarehouse.label} connection`}
                </Title>
            </CreateHeaderWrapper>

            <CreateProjectConnection
                needsProject={needsProject}
                selectedWarehouse={selectedWarehouse}
            />
        </CreateProjectWrapper>
    );
};

interface ConnectManuallyProps {
    needsProject: boolean;
}

const ConnectManually: FC<ConnectManuallyProps> = ({ needsProject }) => {
    const [hasDimensions, setHasDimensions] = useState<boolean>();
    const [selectedWarehouse, setSelectedWarehouse] =
        useState<SelectedWarehouse>();

    return (
        <>
            {!hasDimensions && (
                <DimensionCard
                    needsProject={needsProject}
                    onChangeHasDimensions={setHasDimensions}
                />
            )}

            {hasDimensions && !selectedWarehouse && (
                <WareHouseConnectCard
                    needsProject={needsProject}
                    setWarehouse={setSelectedWarehouse}
                />
            )}

            {hasDimensions && selectedWarehouse && (
                <WarehouseSelectedCard
                    needsProject={needsProject}
                    selectedWarehouse={selectedWarehouse}
                    onSelectWarehouse={setSelectedWarehouse}
                />
            )}
        </>
    );
};

export default ConnectManually;
