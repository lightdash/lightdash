import { type FC } from 'react';
import { DocumentTitle } from '../components/common/DocumentTitle';
import { MobileSetupLanding } from '../features/mobileApp/components/MobileSetupLanding';

const MobileSetup: FC = () => (
    <>
        <DocumentTitle title="Mobile app" />
        <MobileSetupLanding />
    </>
);

export default MobileSetup;
