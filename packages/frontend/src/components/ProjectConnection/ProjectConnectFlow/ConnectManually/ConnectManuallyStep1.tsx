import { AnchorButton, Button, Intent, Position } from '@blueprintjs/core';
import { Tooltip2 } from '@blueprintjs/popover2';
import { FC } from 'react';
import { BackButton } from '../../../../pages/CreateProject.styles';
import ConnectTitle from '../ConnectTitle';
import InviteExpertFooter from '../InviteExpertFooter';
import {
    ButtonsWrapper,
    Codeblock,
    ConnectWarehouseWrapper,
    Subtitle,
    Wrapper,
} from './../ProjectConnectFlow.styles';

const codeBlock = String.raw`models:
- name: my_model
    columns:
    - name: my_column_1
    - name: my_column_2
`;

interface ConnectManuallyStep1Props {
    isCreatingFirstProject: boolean;
    onBack: () => void;
    onForward: () => void;
}

const ConnectManuallyStep1: FC<ConnectManuallyStep1Props> = ({
    isCreatingFirstProject,
    onBack,
    onForward,
}) => {
    return (
        <Wrapper>
            <BackButton icon="chevron-left" text="Back" onClick={onBack} />

            <ConnectWarehouseWrapper>
                <ConnectTitle isCreatingFirstProject={isCreatingFirstProject} />

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
                    onClick={onForward}
                />
            </ConnectWarehouseWrapper>

            <InviteExpertFooter />
        </Wrapper>
    );
};

export default ConnectManuallyStep1;
