import { Icon, Intent } from '@blueprintjs/core';
import { Tooltip2 } from '@blueprintjs/popover2';
import React, { FC } from 'react';
import InviteExpertFooter from './InviteExpertFooter';
import {
    ButtonLabel,
    ButtonsWrapper,
    ConnectWarehouseWrapper,
    LinkToDocsButton,
    SubmitButton,
    Subtitle,
    Title,
    Wrapper,
} from './ProjectConnectFlow.styles';

interface Props {
    setHasDimensions: (dimension: string) => void;
}

const ConnectionOptions: FC<Props> = ({ setHasDimensions }) => {
    return (
        <Wrapper>
            <ConnectWarehouseWrapper>
                <Title>You're in! 🎉</Title>
                <Subtitle>
                    We strongly recommend that you define columns in your .yml
                    file for a smoother experience.
                    <br />
                    Don’t worry! You can do this right now:
                </Subtitle>
                <ButtonsWrapper>
                    <Tooltip2
                        content={
                            'Our tool makes its super easy to set up your dbt project. Check it out now!'
                        }
                        targetTagName="div"
                    >
                        <LinkToDocsButton
                            href="https://docs.lightdash.com/get-started/setup-lightdash/get-project-lightdash-ready"
                            target="_blank"
                        >
                            <ButtonLabel>
                                By using our handy CLI tool
                            </ButtonLabel>
                            <Icon icon="chevron-right" />
                        </LinkToDocsButton>
                    </Tooltip2>
                    <Tooltip2
                        content={
                            'Add the columns you want to explore to your .yml files in your dbt project. Click to view docs.'
                        }
                        targetTagName="div"
                    >
                        <LinkToDocsButton
                            href="https://docs.lightdash.com/guides/how-to-create-metrics"
                            target="_blank"
                        >
                            <ButtonLabel>
                                ...or by adding them manually.
                            </ButtonLabel>
                            <Icon icon="chevron-right" />
                        </LinkToDocsButton>
                    </Tooltip2>
                </ButtonsWrapper>
                <SubmitButton
                    type="submit"
                    intent={Intent.PRIMARY}
                    text="I’ve defined them!"
                    onClick={() => setHasDimensions('hasDimensions')}
                />
            </ConnectWarehouseWrapper>
            <InviteExpertFooter />
        </Wrapper>
    );
};

export default ConnectionOptions;
