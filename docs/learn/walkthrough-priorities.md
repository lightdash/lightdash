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

Each walkthrough must complete in a fresh training copy using only highlighted
controls. Check the persisted result, isolation from the shared training project,
and removal of the copy on return to the library. Use the dedicated
`walkthrough-recorder@lightdash.com` account so a smoke run cannot remove a
person's active training copy.

The scope-tour smoke driver checks the saved metrics-tree result canvas before
allowing completion. Export and verified-chart regressions additionally check
asynchronous completion and save readiness. A generated walkthrough and a passing
coverage audit do not establish that its browser flow succeeds.

Permission tests must distinguish the combined training role from an individual
grant: original verifiers can save and re-verify their content; original deleters
can restore their own content; virtual-view updates check `create:VirtualView`
in the backend; and `manage:ChangeCsvResults` gates export choices in the frontend.
The curriculum does not change those authorization rules.

## Later work

The other 21 scope entries now show Coming Soon: 12 embedding,
3 content-as-code, 2 promotion, validation, analytics, and 2 agent-document
scopes. Their execution environments and access constraints need separate work;
new interactive formats will be delivered as separate tickets. Reading delivery
is removed.

The curriculum also includes viewing and building saved metrics trees, viewing
an AI agent, and viewing a data app. Their prerequisites include metrics-tree
seeding and copying, preservation of teaching samples, and form recovery.

## References

- [Original walkthrough completion contract, CS-212](https://linear.app/lightdash/issue/CS-212)
- [Curriculum PR #28942](https://github.com/lightdash/lightdash/pull/28942)
- [SQL chart walkthrough, CS-224](https://linear.app/lightdash/issue/CS-224)
- [Verification walkthrough, CS-220](https://linear.app/lightdash/issue/CS-220)
- [Export follow-up #28911](https://github.com/lightdash/lightdash/pull/28911)
- [Catalog column documentation](https://github.com/lightdash/mintlify-docs/blob/main/explore/metrics-catalog.mdx#view-catalog-column-configuration)
- [Virtual-view edit and delete documentation](https://github.com/lightdash/mintlify-docs/blob/main/semantic-layer/virtual-views.mdx#edit-or-delete-a-virtual-view)
- [Deleted-content documentation](https://github.com/lightdash/mintlify-docs/blob/main/explore/version-history.mdx#recently-deleted-charts-and-dashboards)
