# In-app curriculum priorities

Direction confirmed by Josh on 2026-09-09: prioritize scopes with existing
in-app paths. The purpose of Learn is to teach scopes through real product
interactions in a disposable training copy. Reading acknowledgment does not
complete a hands-on scope outcome.

The nine entries below now use generated in-app walkthroughs. Seven new paths
and two reused paths replace their reading fallbacks. The other 21 scope entries now show Coming Soon; reading delivery was removed
on 2026-09-10.

| Order | Scope                         | Work                                                                           | Required result                                                                                                            |
| ----- | ----------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| 1     | `manage:CustomSql`            | Check and reuse the existing SQL Runner save flow from CS-224.                 | The learner saves a SQL chart and sees the saved chart.                                                                    |
| 2     | `view:ContentVerification`    | Reuse or extend CS-220 to inspect the verification indicator.                  | The learner locates the indicator on verified content.                                                                     |
| 2     | `manage:VerifiedContent`      | Extend verification teaching with an edit to verified content.                 | The learner sees the documented effect of the edit on verification. Verifying content alone does not satisfy this outcome. |
| 3     | `manage:ChangeCsvResults`     | Extend the export flow, reconciling PR #28911's changes.                       | The learner changes an export option and obtains the corresponding result. An explanation alone is insufficient.           |
| 4     | `view:SpotlightTableConfig`   | Add a path to Manage column visibility.                                        | The learner inspects the saved catalog column configuration.                                                               |
| 4     | `manage:SpotlightTableConfig` | Toggle a column and save the configuration in the learner copy.                | The changed visibility persists on reload in that copy.                                                                    |
| 5     | `manage:VirtualView`          | Extend virtual-view creation with the Explorer menu's edit path.               | The learner edits a disposable virtual view and sees the change.                                                           |
| 5     | `delete:VirtualView`          | Add deletion of a disposable virtual view.                                     | The learner deletes the view and verifies its removal. Creation alone does not satisfy this outcome.                       |
| 6     | `manage:DeletedContent`       | Check Recently deleted availability and add restoration of a disposable chart. | The restored chart appears in its space. Permanent deletion, if taught, uses a separate disposable item.                   |

## Delivery criteria

- Use existing controls and anchors before adding new ones. Scope mappings may
  reuse a tour only when its actions and observed results teach that scope.
- Generate steps from frontend markers and prose from canonical documentation,
  following `.claude/skills/add-scope-walkthrough/SKILL.md`.
- Use the existing trainee permissions. A missing route, feature flag, fixture,
  or accessible control is an explicit dependency to investigate.
- Verify each flow in a fresh training copy with the recorder account, including
  its visible result, isolation from the shared source, and copy cleanup.
- Unsupported modules show Coming Soon. Keep content presence distinct from
  verified hands-on completion in coverage and reporting.

## Verification

Browser checks on 2026-09-09 use `walkthrough-recorder@lightdash.com` against
the local instance, with a fresh training copy for every path. The driver clicks
only highlighted controls. Each run verifies its result through the API,
compares the shared source before and after, and checks that returning to the
library removes the copy.

| Scope | Steps | Observed result |
| --- | ---: | --- |
| `manage:CustomSql` | 12 | Saved SQL chart can be fetched in the copy and is absent from the source. |
| `view:ContentVerification` | 7 | Saved chart has a visible, persisted verification badge. |
| `manage:VerifiedContent` | 12 | Changed query saves a new version with verification preserved. |
| `manage:ChangeCsvResults` | 9 | All-results request has no row limit; CSV download completes. |
| `view:SpotlightTableConfig` | 4 | Catalog visibility controls open. |
| `manage:SpotlightTableConfig` | 6 | Saved column visibility persists in a newly opened page. |
| `manage:VirtualView` | 20 | Renamed virtual view persists and its new name appears in Explorer. |
| `delete:VirtualView` | 19 | Created view is deleted and absent from the tables response. |
| `manage:DeletedContent` | 15 | Deleted chart is restored, can be opened, and leaves the deleted list. |

The virtual-view edit path handles the optional unsaved-query confirmation.
Catalog, verified-chart, and virtual-view results wait for saving to finish.
The export result waits for successful job completion and download initiation,
including when an export is retried.
The catalog also waits for local settings to match the server-refetched config.

The local recorder flow is
`~/.claude/scripts/verify-recorder/flows/learn-nine-in-app-paths.mjs`, using a
copy of the shared smoke driver with result assertions. Screenshots, API
observations, and recordings are in `/tmp/learn-priority-evidence`. Card
thumbnails are captured from the same real UI through `--thumbnails`.
The successful full recording is
`learn-nine-in-app-paths-2026-09-09T22-26-18.mp4`. The final export timing fix
also passes a fresh click-only smoke and delayed-success/failure regressions.

The `learn-scope-access.mjs` recording checks the ordinary viewer project:
SQL chart creation, catalog configuration saves, virtual-view deletion, and
verified-content listing return 403. The new Recently deleted route denies
that viewer, and unrestricted export choices are hidden. The deleted-content
list API intentionally returns the viewer's own deletions rather than 403.

Validation of the original nine walkthroughs: 66 frontend tests passed, along
with frontend typechecking, changed-file lint and formatting, generator fixtures,
and the then-existing concept extraction/citation tests,
coverage tests, and the strict release audit. The walkthrough checker reports
zero errors and 12 warnings (repeated navigation titles and existing anchor
warnings).

These are product-outcome checks, with the training role's combined prerequisites.
They do not isolate every individual grant: the original verifier can save and
re-verify their content; original deleters can restore their own content;
virtual-view updates check `create:VirtualView` in the
backend; and `manage:ChangeCsvResults` gates export choices in the frontend.
No authorization rules are changed by these walkthroughs.

## Later work

The other 21 scope entries now show Coming Soon: 12 embedding,
3 content-as-code, 2 promotion, validation, analytics, and 2 agent-document
scopes. Their execution environments and access constraints need separate work;
new interactive formats will be delivered as separate tickets. Reading delivery
is removed.

Keep the useful supporting changes in #28941 (metrics-tree seed/copy), #28945
(form recovery), and #28948 (teaching samples and thumbnails), along with the
four actual walkthroughs in #28942.

## References

- [Original walkthrough completion contract, CS-212](https://linear.app/lightdash/issue/CS-212)
- [Curriculum PR #28942](https://github.com/lightdash/lightdash/pull/28942)
- [SQL chart walkthrough, CS-224](https://linear.app/lightdash/issue/CS-224)
- [Verification walkthrough, CS-220](https://linear.app/lightdash/issue/CS-220)
- [Export follow-up #28911](https://github.com/lightdash/lightdash/pull/28911)
- [Catalog column documentation](https://github.com/lightdash/mintlify-docs/blob/main/explore/metrics-catalog.mdx#view-catalog-column-configuration)
- [Virtual-view edit and delete documentation](https://github.com/lightdash/mintlify-docs/blob/main/semantic-layer/virtual-views.mdx#edit-or-delete-a-virtual-view)
- [Deleted-content documentation](https://github.com/lightdash/mintlify-docs/blob/main/explore/version-history.mdx#recently-deleted-charts-and-dashboards)
