# Binder clip execution record — accepted r08

Date: 2026-10-23. One stylized prop, native 160×160, editable transparent SVG.
The user explicitly accepted r08 for public display after the new whole review.
No game integration or mechanical-load validation was performed.

## R/B: observations and shared basis

Actual complementary photographs were opened, compared and assigned specific roles
in the [case README](README.md). The clear mouth photograph supplies BODY dimensions
and formation; the different oblique specimen supplies pose and complete handles.
The foreshortened mouth view does not determine intrinsic handle curvature/length.
The MAUL 21532 front/side drawing supplies complementary interface evidence, not
exact dimensions for these other clips.

The complete inventory is one sheet with four outer rolls, two returning central
lips and four entry reliefs, plus two continuous wire handles. Opposing curls start
from their own inner roots, turn through the curved wall and return toward their
own sheet. The model tests this formation, rather than translating one tube shell.
The lower dark photographic footprint is cast shadow, not an extra plate.

Construction units are normalized: sheet width 45, back depth derived from a
21.3 slant and 10.3 half-opening, outer/central nominal radii 2.7/2.4, sheet
thickness 0.16 and wire radius 0.6. These are not measured millimetres. Hidden
central roots and roll angles remain bounded construction choices.

One common BODY camera was fitted with the actual upstream
[img2threejs camera solver](https://github.com/img2threejs/img2threejs/tree/954cd5845e90efd045694bab725d68a9863c20e0)
(Apache-2.0), using six identified BODY correspondences; other endpoints were
held out. Its unchanged camera was used to compare the following BODY revisions.
The saved construction preserves the corresponding camera parameters.
Far upper central endpoint residual remains approximately 20px at photo size.
This was not treated as an exact scan or a recovered unique hidden structure.

An attempted handle-camera fit based on projected curve extrema was rejected:
those extrema need not identify the same material points across views. The final
handle uses a shared planar U supported by complementary whole/side evidence,
with two rigid hinge poses; the target camera remains approximate.

## P/M/V: all eleven local scopes

Each local had an actual isolated geometry view, then material and adjacency
views, followed by actual light/dark native inspection before advancing.
The shared coordinates and material roles were retained through assembly.

| Current local | Concrete observation checked |
| --- | --- |
| [N wire](locals/N-wire.svg) | Complete two-legged U, own two bent pins, real hidden/reappearing path; no extra terminal dot |
| [F wire](locals/F-wire.svg) | Same intrinsic U, rigid opposing pose; both short pin islands remain real visible parts |
| [N-L](locals/N-L.svg) | Open C wall, inner root and returning free edge, actual wire entry |
| [F-L](locals/F-L.svg) | Opposite sheet's own curl direction and partially hidden far roll, not a translated near shell |
| [N central](locals/N-central.svg) | Raised returning lip, broader root and shorter free span; unequal end cuts |
| [F central](locals/F-central.svg) | Opposing return and real narrow far exposed edge; hidden rear line not drawn through the near face |
| [N-R](locals/N-R.svg) | Open roll and near pin-through path; front/back end-port relationship |
| [F-R](locals/F-R.svg) | Own root/curl formation, real far pin exposure, shared axis family |
| [N face](locals/N-face.svg) | Both reliefs, full boundary, continuous attachments and common coating |
| [F face](locals/F-face.svg) | Both opposing reliefs and true dark inner face; no added shadow plate |
| [Back web](locals/back-web.svg) | Actual continuous fold between both faces, exposed inner wall/cut edge only |

The [complete N](locals/N-wire-complete.svg) and
[complete F](locals/F-wire-complete.svg) studies remove neighboring occlusion without
changing either wire. The material uses dark coated-sheet tones and distinctly
brighter silver-wire tones, with common ink outlines and light/shadow roles.

N/F had independent current local reviews. Each BODY scope was also actually
opened and reviewed by the author before assembly. Local approval was never
used as a substitute for the following new whole review.

## A/W: actual failed assembly, repair and new review

The first r07 whole retained all eleven checked groups and had continuous native
geometry, but a fresh independent whole review found a fine false dark seam at
N-face/N-central and N-face/N-R. The actual
[rejected render crop](assembly-seam-rejected.png) is retained. A second limited
review had missed this seam; reviewer agreement was not a sufficient criterion.

Cause: each semantic local overpainted a dark underfill at a continuous attachment;
anti-aliasing could darken it despite a merged physical-sheet substrate underneath.
r08 removed only that underpaint in a narrow attachment band. Actual material
faces, physical strokes, both wires, substrate, geometry and camera stayed unchanged.
All nine affected material locals were regenerated and opened individually before
the new exact assembly and whole review.

The new independent whole review actually reopened current light/dark large images,
native four-turn views, the fixed primary-photo comparison and three construction
cameras. It rechecked the entire perimeter, all retained entities, four pin paths,
central line visibility and real narrow far edge. Thirty-two projected attachment
bands included 3,909 stable interior pixels with no new dark/bright seam deviations
of at least three per channel; the original failure pixels recovered their surface
color. These finite checks locate the observed seam failure, not all possible defects.

The actual saved evaluated model has one closed connected sheet (1,800 vertices)
and two closed connected wire instances (4,620 vertices each); no nonadjacent
self-intersections or inter-object crossings were detected at this authored pose.
No all-motion, spring-force or manufacturing-tolerance claim follows from that.

Current r08 passed this finite static whole review, then the user approved public
display. [case-manifest.json](case-manifest.json) records the reviewed source hash,
public source hash and exact local groups. The public SVG adds license metadata;
its rendered pixels are checked against the accepted source separately.

## Earlier genuine failures and limits

The retained [before.svg](before.svg) is an actual earlier rejected draft. The work
also exposed omitted far rolls, shadow mistaken for structure, a flat-looking
central lip, arbitrary handle depth inferred from a foreshortened projection,
self-intersecting curve sweeps, invalid two-anchor orthographic alignment and
insufficient local/whole review. Those earlier passes were withdrawn.

The current construction and user acceptance do not retroactively validate those
versions or establish a no-skill/with-skill improvement rate. Raw failed iterations,
tool outputs and independent reports were preserved outside the installable package;
the repository keeps a compact, reproducible current example and representative failures.

Optional native inspection with Blender 4.5 (not required to install either Skill):

```sh
blender --disable-autoexec -b examples/svg-binder-clip/construction.blend --python-exit-code 1 --python scripts/inspect-binder.py -- --output /absolute/temporary-directory
node scripts/render-example.mjs --construction-views /absolute/temporary-directory
```

This actually checks saved meshes and regenerates the three construction views.
SVG assembly/rendering uses `npm run assemble:example` and `npm run render:example`.
Editing a model requires renewed projection/local review; assembly does not silently
reproject a modified model. Renderer success and exact-group hashes remain integrity
evidence, not automatic visual approval.
