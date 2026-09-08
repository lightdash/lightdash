/**
 * Generate guided walkthroughs from the product's own permission markers.
 *
 * A walkthrough for a scope (e.g. `manage:PinnedItems`) is not hand-written.
 * Each control the scope unlocks carries a `data-tour-scope` marker placed
 * beside the ability check that hides it, so the walkthrough is built from the
 * same places the product decides what to show:
 *
 *   data-tour-scope="manage:PinnedItems"   the scope this control belongs to
 *   data-tour-step="2"                     order within the walkthrough
 *   data-tour-route="/projects/:projectUuid/spaces"   page the control is on
 *   data-tour-label="..."                  one line: what the learner does here
 *   data-tour-title="Create a dashboard"   on the action marker: the
 *                                          walkthrough's own name, shown on
 *                                          its library card
 *   data-tour-docs="explore/homepage.mdx#pin-content:1-2" docs section for the
 *                                          body; `:n` / `:a-b` pick sentences of
 *                                          the first prose paragraph, `:p2:n`
 *                                          of the second (images/JSX skipped),
 *                                          `:li3` the third list item;
 *                                          `#intro` is the page's text before
 *                                          its first heading; a sentence cited
 *                                          from mid-paragraph loses a leading
 *                                          connector ("Either way, ")
 *   data-tour-then='<sel> >> ...'           clicks after the marked control that
 *                                          complete the action (a confirm button)
 *   data-tour-return='<sel> >> ...'         on the step-1 (result) marker: the
 *                                          click path back to it at the end;
 *                                          defaults to the home link; "none"
 *                                          when the action itself lands there
 *   data-tour-suggest="Orders overview"    on a typed anchor: what the card
 *                                          offers to fill in with one click;
 *                                          a typed step must have one
 *   data-tour-input="true"                 on an anchor: a text field; its step
 *                                          advances once the learner has typed
 *   data-tour-look="1"                     a surface worth a look on the way,
 *   data-tour-after='<sel>'                taken right after the path click
 *                                          `after` names (a tile while the
 *                                          dashboard is still editable);
 *                                          label and docs as usual; with
 *                                          data-tour-interactive the learner
 *                                          may use the surface (drag, resize)
 *                                          and moves on with Next
 *   data-tour-result="2"                   a further surface of the result
 *                                          worth its own look (the answer
 *                                          text, the chart, the rating
 *                                          controls): one closing step each,
 *                                          in this order, after "See the
 *                                          result"; label and docs as usual
 *   data-tour-busy='<sel>'                 on the step-1 (result) marker: the
 *                                          page's own "still working" surface
 *                                          (a streaming reply); the closing
 *                                          step follows it, shows its
 *                                          `[data-tour-status]` words and
 *                                          holds Got it until it is gone
 *   data-tour-result-docs="file#anchor:n"  on the step-1 (result) marker: the
 *                                          docs sentence shown on the closing
 *                                          step; no sentence means no body
 *   data-tour-interactive="true"           the learner acts; the tour advances
 *                                          when the marked control is clicked
 *   A path selector is [data-tour-nav="x"] or [data-tour-anchor="x"], optionally
 *   followed by [data-tour-value="y"] to name one of several controls sharing an
 *   anchor (a tree node by label); the hint's {value} becomes y. An anchor
 *   used both plainly and by name carries data-tour-hint-named for the
 *   named case.
 *   A hop suffixed `?` is optional: a control only some instances show on
 *   the way to the next one (a chooser some configurations put before a
 *   form). It gets no step; the next control's step spotlights it, with its
 *   own hint, while it is on the page and the next control is not.
 *   data-tour-via='<sel> >> <sel> >> ...'  the click path to the marked control
 *                                          from anywhere in the project (nav
 *                                          buttons, menu items, triggers). Each
 *                                          control on the path becomes its own
 *                                          step, titled by that control's
 *                                          `data-tour-hint`. The tour never
 *                                          navigates for the learner.
 *
 * Titles come from the scope registry in @lightdash/common; explanatory text
 * comes from the docs page the marker cites. Nothing is invented at build time.
 * The recipe for adding a walkthrough is the repo skill
 * `.claude/skills/add-scope-walkthrough/SKILL.md`.
 *
 * Usage: pnpm scope-tours:generate   (LIGHTDASH_DOCS_DIR overrides ../mintlify-docs)
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { buildTours, outputPath, root } from './lib';

const main = () => {
    const { tours, markers } = buildTours();
    const body = tours
        .map(
            (tour) =>
                `    ${JSON.stringify(tour.scope)}: ${JSON.stringify(
                    tour,
                    null,
                    4,
                )
                    .split('\n')
                    .join('\n    ')},`,
        )
        .join('\n');
    const output = `/* eslint-disable */
// Generated by scripts/scope-tours/generate.ts from data-tour-* markers in the
// frontend and the docs sections they cite. Do not edit by hand; run
// \`pnpm scope-tours:generate\`.

export type ScopeTourStepDefinition = {
    target: string;
    route?: string;
    title: string;
    body: string;
    interactive: boolean;
    advanceOnTargetClick: boolean;
    advanceOnTargetInput: boolean;
    via: string[];
    /**
     * Optional hops on the way to \`target\`: controls that lead to it on the
     * instances that show them. Spotlit, with their own title, while one is
     * on the page and the target is not.
     */
    detour?: { target: string; title: string }[];
    /** The page's "still working" surface; the step waits for it to go. */
    busy?: string;
    /** For a typed step: what the card offers to fill in with one click. */
    suggestion?: string;
};

export type ScopeTourDefinition = {
    scope: string;
    title: string;
    /** Frontend files whose markers produced the steps. */
    sources: string[];
    steps: ScopeTourStepDefinition[];
};

export const SCOPE_TOURS: Record<string, ScopeTourDefinition> = ${body ? `{\n${body}\n}` : '{}'};
`;
    writeFileSync(outputPath, output);
    console.log(
        `Wrote ${tours.length} scope tour(s) from ${markers.length} marker(s) to ${path.relative(root, outputPath)}`,
    );
};

main();
