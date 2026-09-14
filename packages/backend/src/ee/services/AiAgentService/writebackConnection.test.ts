import {
    DbtProjectType,
    type DbtBitBucketProjectConfig,
} from '@lightdash/common';
import { getWritebackConnectionSupport } from './writebackConnection';

const bitbucket: DbtBitBucketProjectConfig = {
    type: DbtProjectType.BITBUCKET,
    repository: 'workspace/dbt',
    branch: 'main',
    username: 'user',
    personal_access_token: 'token',
    project_sub_path: '/',
};

describe('writeback connection support', () => {
    it.each([undefined, '', 'bitbucket.org', ' BITBUCKET.ORG. '])(
        'offers only dbt editing on Bitbucket Cloud host %s',
        (host_domain) => {
            expect(
                getWritebackConnectionSupport({ ...bitbucket, host_domain }),
            ).toEqual({ editDbtProject: true, editRepo: false });
        },
    );
    it.each(['bitbucket.internal', 'bitbucket.org.evil.test'])(
        'offers no writeback for unsupported host %s',
        (host_domain) => {
            expect(
                getWritebackConnectionSupport({ ...bitbucket, host_domain }),
            ).toEqual({ editDbtProject: false, editRepo: false });
        },
    );
    it.each([DbtProjectType.GITHUB, DbtProjectType.GITLAB] as const)(
        'preserves both tools for %s',
        (type) => {
            expect(
                getWritebackConnectionSupport({
                    ...bitbucket,
                    type,
                    authorization_method: 'personal_access_token',
                }),
            ).toEqual({ editDbtProject: true, editRepo: true });
        },
    );
});
