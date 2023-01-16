import { Button, InputGroup, Intent } from '@blueprintjs/core';
import { MenuItem2, Popover2 } from '@blueprintjs/popover2';
import { Organisation } from '@lightdash/common';
import React, { FC, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import {
    useDeleteOrganisationMutation,
    useOrganisation,
} from '../../../hooks/organisation/useOrganisation';
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
    const { isLoading: isOrgLoading, data: organisation } = useOrganisation();
    const { mutate, isLoading: isDeleting } = useDeleteOrganisationMutation();

    const [showConfirmation, setShowConfirmation] = useState<boolean>(false);
    const [errorMessage, setErrorMessage] = useState<string>();
    const [confirmOrgName, setConfirmOrgName] = useState<string>();
    const { user } = useApp();

    if (isOrgLoading || organisation === undefined) return null;
    if (!user.data?.ability?.can('delete', 'Organization')) return null;

    return (
        <>
            <CardContainer>
                <div>
                    <Title>Danger zone </Title>
                    <Description>
                        This action deletes the whole workspace and all its
                        content, including users. This action is not reversible.
                    </Description>
                </div>
                <PanelContent>
                    <Button
                        outlined
                        intent={Intent.DANGER}
                        icon="delete"
                        text="Delete 'Organisation'"
                        onClick={() => setShowConfirmation(true)}
                    />
                </PanelContent>
            </CardContainer>

            <BaseModal
                isOpen={showConfirmation}
                title="Delete 'Organisation'"
                icon="delete"
                onClose={() => setShowConfirmation(false)}
                renderBody={() => (
                    <>
                        <p>
                            Type the name of this organization{' '}
                            <b>{organisation.name}</b> to confirm you want to
                            delete this organisation and its users. This action
                            is not reversible.
                        </p>

                        <InputGroup
                            placeholder={organisation.name}
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
                                confirmOrgName?.toLowerCase() !=
                                organisation.name.toLowerCase()
                            }
                            intent={Intent.DANGER}
                            type="submit"
                            text={'Delete'}
                            loading={isDeleting}
                            onClick={() => {
                                mutate(organisation.organizationUuid);
                            }}
                        />
                    </>
                )}
            />
        </>
    );
};
