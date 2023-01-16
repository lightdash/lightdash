import { Button, InputGroup, Intent } from '@blueprintjs/core';
import { MenuItem2, Popover2 } from '@blueprintjs/popover2';
import { Organisation } from '@lightdash/common';
import React, { FC, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useOrganisation } from '../../../hooks/organisation/useOrganisation';
import { useOrganisationUpdateMutation } from '../../../hooks/organisation/useOrganisationUpdateMutation';
import { useApp } from '../../../providers/AppProvider';
import { isValidEmailDomain } from '../../../utils/fieldValidators';
import { ErrorMessage } from '../../common/modal/ActionModal';
import BaseModal from '../../common/modal/BaseModal';
import Form from '../../ReactHookForm/Form';
import Input from '../../ReactHookForm/Input';
import TagInput from '../../ReactHookForm/TagInput';
import {
    CardContainer,
    DeleteButton,
    Description,
    FormWrapper,
    PanelContent,
    Title,
} from './DeleteOrganisationPanel.styles';

export const DeleteOrganisationPanel: FC = () => {
    const { isLoading: isOrgLoading, data: organization } = useOrganisation();

    const [showConfirmation, setShowConfirmation] = useState<boolean>(false);
    const [errorMessage, setErrorMessage] = useState<string>();
    const [isDisabled, setIsDisabled] = useState<boolean>(false);
    const [confirmOrgName, setConfirmOrgName] = useState<string>();
    const { user } = useApp();

    if (isOrgLoading || organization === undefined) return null;
    if (!user.data?.ability?.can('manage', 'Organization')) return null;

    return (
        <>
            <CardContainer>
                <div>
                    <Title>Danger zone </Title>
                    <Description>
                        This action deletes the whole workspace and all its
                        content. This action is not reversible.
                    </Description>
                </div>
                <PanelContent>
                    <Button
                        outlined
                        intent={Intent.DANGER}
                        icon="delete"
                        text="Delete 'Organization'"
                        onClick={() => setShowConfirmation(true)}
                    />
                </PanelContent>
            </CardContainer>

            <BaseModal
                isOpen={showConfirmation}
                title="Delete 'Organization'"
                icon="delete"
                onClose={() => setShowConfirmation(false)}
                renderBody={() => (
                    <>
                        <p>
                            Type the name of this organization{' '}
                            <b>{organization.name}</b> to confirm you want to
                            delete it. This action is not reversible.{' '}
                        </p>

                        <InputGroup
                            placeholder={organization.name}
                            value={confirmOrgName}
                            onChange={(e) => setConfirmOrgName(e.target.value)}
                        />
                    </>
                )}
                renderFooter={() => (
                    <>
                        <ErrorMessage>{errorMessage}</ErrorMessage>

                        <Button
                            onClick={() => {
                                setShowConfirmation(false);
                                setConfirmOrgName('');
                            }}
                        >
                            Cancel
                        </Button>

                        <Button
                            data-cy="submit-base-modal"
                            disabled={
                                isDisabled ||
                                confirmOrgName?.toLowerCase() !=
                                    organization.name.toLowerCase()
                            }
                            intent={Intent.DANGER}
                            type="submit"
                            text={'Delete'}
                            loading={isDisabled}
                        />
                    </>
                )}
            />
        </>
    );
};
