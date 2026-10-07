# Obscured data app thumbnails

Status: spec, ready for implementation.

## Problem Statement

A data app's thumbnail is captured automatically, rendered as the user who
created the version. The image shows that user's data: KPI values, table rows,
chart labels. Anyone who can open the app sees the same thumbnail on the home
page and in the apps list.

Two problems follow, raised by a customer:

- Sensitive values are visible on list pages without opening anything. A user
  with access to sensitive data cannot safely open their own home page in a
  shared setting.
- The thumbnail is not per viewer. A user restricted by user attributes to
  their own accounts sees the thumbnail of the version creator, who may see the
  whole company.

## Solution

Automatic captures become **obscured thumbnails**: before the screenshot is
taken, every piece of text in the running app is blurred in proportion to its
font size, chart canvases are softened, and the resulting image gets a light
global blur. Layout, chart shapes and colours stay recognisable; no value,
label or name is readable, regardless of how large it is rendered.

The clear image is never stored. Thumbnails set by hand are unchanged. The
feature ships behind an organization feature flag that also gates automatic
capture itself, so nothing is captured in clear while it rolls out.

## User Stories

1. As a data app viewer, I want thumbnails on the home page and apps list to
   show no readable values, so that I can open those pages in a shared setting.
2. As a data app viewer restricted by user attributes, I want the thumbnail to
   reveal nothing about rows I cannot query, so that another user's access does
   not leak to me through an image.
3. As a data app viewer, I want the thumbnail to still show the app's layout,
   chart types and colours, so that I can tell apps apart at a glance.
4. As a data app author, I want a version to get an obscured thumbnail
   automatically when it becomes ready, so that I do not have to capture one by
   hand.
5. As a data app author, I want a thumbnail I set by hand to be stored exactly
   as I uploaded it, so that I can choose to publish a clear image on purpose.
6. As a data app author, I want a hand-set thumbnail to survive later automatic
   captures, so that my choice is not silently replaced by an obscured one.
7. As an organization admin, I want the automatic capture setting to say that
   values are blurred, so that I can answer my team's privacy questions from
   the settings page.
8. As an organization admin, I want to turn automatic capture off entirely, so
   that no image of any kind is produced without a human choosing it.
9. As an organization admin, I want thumbnails captured before this change to
   stay as they are, so that nothing disappears from my apps list on upgrade.
10. As a security-conscious customer, I want a capture to be abandoned when the
    obscuring step cannot be confirmed, so that a bug never results in a clear
    image being stored.
11. As a security-conscious customer, I want a hero KPI rendered at very large
    font size to be as unreadable as a small axis label, so that the protection
    does not depend on how an agent laid out the app.
12. As a Lightdash operator, I want obscured capture gated by an organization
    feature flag, so that it can be verified on selected organizations before
    everyone gets it.
13. As a Lightdash operator, I want automatic capture paused for organizations
    without the flag, so that clear captures stop as soon as this ships.
14. As a Lightdash operator, I want the setting card hidden for organizations
    without the flag, so that admins are not offered a control that does
    nothing.
15. As a Lightdash operator, I want the extra capture cost to be well under a
    second per version, so that the scheduler queue is not slowed down.
16. As a self-hosted operator, I want the flag resolvable through the standard
    enable and disable environment lists, so that no new per-feature variable is
    needed.
17. As a developer, I want the obscuring strength to be a small number of named
    constants, so that tuning after real-world feedback is a one-line change.
18. As an AI agent reading a data app's metadata, I want the thumbnail to keep
    working as a reference image, so that my ability to find apps is unchanged.

## Implementation Decisions

### Scope of obscuring

- Only automatic captures are obscured. Manual captures are stored byte for
  byte as uploaded.
- Obscuring happens at capture time. The stored object under the automatic
  thumbnail key is already obscured. There is no clear copy anywhere.
- Existing thumbnails are left untouched. No migration, deletion, or
  re-capture.
- Custom chart types keep their app-level manual image and are never captured
  automatically, as today.

### Obscuring recipe

Chosen after side-by-side trials on a real dashboard capture, four production
thumbnails, and a synthetic page with a 150px KPI. Purely image-level blur or
pixelation is font-size dependent: any strength that keeps the layout readable
leaves a large KPI legible, and any strength that hides it destroys the
layout. The recipe therefore works inside the page first.

1. After the ready indicator appears, inject one stylesheet into the main
   frame and every child frame (viz iframes are same-origin). From the
   prototype, the decision-rich part:

   ```css
   * { -webkit-text-fill-color: transparent !important;
       text-shadow: 0 0 0.6em currentColor !important; }
   svg text { filter: blur(0.35em) !important; }
   canvas   { filter: blur(4px) !important; }
   ```

   The fill goes transparent while `color` stays, so the shadow takes each
   element's own colour and scales with its font size. A `* { filter }` rule was
   rejected because filters compound through every ancestor. A JS tree walk was
   rejected because CSS also covers text mounted after injection.
2. Verify per frame that the computed text fill colour of the body is
   transparent. If any frame fails verification or the injection throws, the
   capture fails. Nothing is stored.
3. Take the screenshot as today.
4. Apply a global gaussian blur with sigma proportional to image width
   (0.6% of width, which is sigma 3 at 480px) so canvas-drawn labels and
   residual edges soften.
5. Store under the automatic thumbnail key and mark the version as today.

Measured on a worst-case page (10.8k px tall, 4000 nested text cells, six
canvases, software raster): about 135 ms for injection and style recalc and
about 500 ms extra in the screenshot. Acceptable.

### Where it lives

- The headless render for a data app version returns an obscured image. The
  obscuring is part of the capture contract of the unfurl service, not a
  separate step the thumbnail client has to remember to call.
- The image-level blur is a pure function from PNG buffer to PNG buffer so it
  can be tested with a real generated image.
- Sigma, text-shadow radius and canvas blur are named constants in one place.

### Setting

- The existing organization setting `dataAppAutomaticThumbnailsEnabled` keeps
  its boolean shape. `true` (or unset) now means obscured automatic capture.
  There is no clear-capture mode.
- The settings card copy gains one sentence stating that text is blurred so
  values are not readable. No other UI change.

### Feature flag

- New organization-scoped flag `EnableDataAppAutomaticThumbnails`, registered
  alongside the other data app flags, default off.
- Backend: the automatic capture decision resolves the flag for the app's
  organization through the shared resolver, in addition to the headless browser
  check, the custom chart type check and the organization setting. Flag off
  means no automatic capture is enqueued and an already enqueued capture is
  skipped with a distinct skip reason.
- Frontend: the automatic capture settings card is hidden when the flag is off
  for the viewer's organization.
- Manual capture, serving existing thumbnails and thumbnail copy on promote are
  not gated.
- Resolution follows the standard precedence: environment enable list, disable
  list, then database overrides. No per-feature environment variable.

## Testing Decisions

A good test exercises an outcome a user or operator can observe: what image is
stored, whether a capture ran, what the settings page shows. It does not assert
on how the stylesheet string is built or which internal method ran.

Seams, all existing:

- **Thumbnail client** with in-memory storage and a stubbed headless render.
  Covers: flag off skips automatic capture with its own reason; flag on and
  setting on stores the image the render returned; a render failure stores
  nothing and leaves the version ready; manual capture ignores the flag.
  Prior art: the existing thumbnail client test suite with
  `organizationSettingsModelWith` and the in-memory storage.
- **Unfurl service data app capture** with the mocked browser page. Covers: a
  stylesheet is added to every frame before the screenshot; the capture fails
  when a frame's verification reports a non-transparent fill; the returned
  buffer is the blurred image, not the raw screenshot. Prior art: the existing
  `captureDataAppVersion` tests using the screenshot setup helper.
- **Image blur function** with a real PNG generated in the test. Covers: output
  differs from input, dimensions are preserved, a solid-colour image is
  unchanged. Small and pure.
- **Settings page** component test. Covers: card hidden when the flag is off,
  shown with the new copy when on. Prior art: the existing settings page
  tests.
- **Build-ready capture enqueue** in the app generate service. Covers: nothing
  is queued when the flag is off for the organization. Prior art: the existing
  thumbnail capture after build tests.

No end-to-end browser test. The recipe was validated by hand on real captures;
a pixel-level assertion would be brittle and slow.

## Out of Scope

- Per-viewer thumbnails.
- Synthetic-data or skeleton render mode where no query runs. Remains the
  stronger long-term option if a customer needs zero trace of real data.
- Detecting which explores an app queries to decide whether real-data
  thumbnails are safe.
- Re-capturing or deleting thumbnails captured before this change.
- A three-state setting with a clear-capture option.
- Obscuring manual thumbnails or images attached to prompts.
- Blocking query requests in the headless session; not needed since the image
  is obscured regardless of what rendered.

## Further Notes

- Glossary term added to `docs/data-apps/CONTEXT.md`: **Obscured thumbnail**.
- Trial images are under `/tmp/thumb-compare/` on the author's machine:
  `montage.png`, `montage2-*.png`, `montage3-*.png` (image-level variants),
  `montage4-textblur.png`, `montage5-css.png`, `montage6-shadow.png`
  (in-page variants), and `real/montage-real*.png` (production thumbnails).
- Large display titles such as an app's name may remain semi-legible after
  obscuring. They are not data; this is accepted.
- Legibility of very large text after the global blur alone was the deciding
  evidence against a simpler image-only approach; keep the in-page step if the
  recipe is ever tuned.
