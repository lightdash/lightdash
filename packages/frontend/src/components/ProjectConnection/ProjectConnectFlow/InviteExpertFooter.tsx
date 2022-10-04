import { FC } from 'react';
import { Link } from 'react-router-dom';
import { FormFooterCopy } from './ProjectConnectFlow.styles';

const InviteExpertFooter: FC = () => (
    <FormFooterCopy>
        This step is best carried out by your organization’s analytics experts.
        If this is not you,{' '}
        <Link to={`/generalSettings/userManagement?to=invite`}>
            invite them to Lightdash!
        </Link>
    </FormFooterCopy>
);

export default InviteExpertFooter;
