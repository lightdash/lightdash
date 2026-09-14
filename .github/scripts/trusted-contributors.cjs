/**
 * Closes pull requests from external authors who are not listed in
 * .github/trusted-contributors.yml. Runs under pull_request_target, so the
 * list is read from the default branch and a pull request cannot change the
 * rules that apply to itself.
 */

const TRUSTED_LIST_PATH = '.github/trusted-contributors.yml';
const LABEL = 'closed-external';

const INTERNAL_ASSOCIATIONS = ['OWNER', 'MEMBER', 'COLLABORATOR'];

const parseTrustedUsernames = (fileContent) =>
    fileContent
        .split('\n')
        .map((line) => line.replace(/#.*/, ''))
        .map((line) => line.match(/^\s*-\s*([A-Za-z0-9][A-Za-z0-9-]*)\s*$/))
        .filter(Boolean)
        .map((match) => match[1].toLowerCase());

const closeComment = (repoUrl, author) =>
    [
        `Hi @${author}, thanks for taking the time to open this.`,
        '',
        'Lightdash only accepts code contributions we have planned together, so we are closing this pull request.',
        '',
        `This is not a judgment of your work. We would still like to understand the problem, so please open a [bug report](${repoUrl}/issues/new?template=bug_report.yml) or [feature request](${repoUrl}/issues/new?template=feature-request.yml) instead. If you are a Lightdash customer, please contact us through your support channel.`,
        '',
        `See our [contributing guide](${repoUrl}/blob/main/.github/CONTRIBUTING.md) for the full policy.`,
    ].join('\n');

module.exports = async ({ github, context, core }) => {
    const pr = context.payload.pull_request;
    const author = pr.user.login;

    if (pr.user.type === 'Bot') {
        core.info(`Skipping: ${author} is a bot`);
        return;
    }

    if (INTERNAL_ASSOCIATIONS.includes(pr.author_association)) {
        core.info(`Skipping: ${author} is ${pr.author_association}`);
        return;
    }

    // author_association reports org members with private membership as
    // CONTRIBUTOR or NONE, so verify actual repository permission before
    // treating anyone as external.
    const hasWriteAccess = async (username) => {
        try {
            const { data } = await github.rest.repos.getCollaboratorPermissionLevel({
                ...context.repo,
                username,
            });
            return ['admin', 'write'].includes(data.permission);
        } catch (error) {
            if (error.status === 404) return false;
            throw error;
        }
    };

    if (await hasWriteAccess(author)) {
        core.info(`Skipping: ${author} has write access`);
        return;
    }

    // A maintainer reopening an external PR is a deliberate human override;
    // closing it again would fight them.
    if (
        context.payload.action === 'reopened' &&
        context.actor !== author &&
        (await hasWriteAccess(context.actor))
    ) {
        core.info(`Skipping: reopened by ${context.actor}, who has write access`);
        return;
    }

    const { data: file } = await github.rest.repos.getContent({
        ...context.repo,
        path: TRUSTED_LIST_PATH,
        ref: context.payload.repository.default_branch,
    });
    const trusted = parseTrustedUsernames(
        Buffer.from(file.content, 'base64').toString('utf8'),
    );

    if (trusted.includes(author.toLowerCase())) {
        core.info(`Skipping: ${author} is a trusted contributor`);
        return;
    }

    core.info(`Closing: ${author} is not in ${TRUSTED_LIST_PATH}`);

    try {
        await github.rest.issues.getLabel({ ...context.repo, name: LABEL });
    } catch (error) {
        if (error.status !== 404) throw error;
        await github.rest.issues.createLabel({
            ...context.repo,
            name: LABEL,
            color: 'ededed',
            description: 'Closed automatically: author is not a trusted contributor',
        });
    }
    await github.rest.issues.addLabels({
        ...context.repo,
        issue_number: pr.number,
        labels: [LABEL],
    });

    const repoUrl = `${context.serverUrl}/${context.repo.owner}/${context.repo.repo}`;
    await github.rest.issues.createComment({
        ...context.repo,
        issue_number: pr.number,
        body: closeComment(repoUrl, author),
    });

    await github.rest.pulls.update({
        ...context.repo,
        pull_number: pr.number,
        state: 'closed',
    });
};
