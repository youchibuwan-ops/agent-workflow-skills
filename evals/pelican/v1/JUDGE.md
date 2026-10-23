# Visual review task

Review two original illustrations of a pelican riding a bicycle. Judge the rendered
pixels only. Do not speculate about how either was produced. Open each full-size
and half-size image separately before comparing them. Cartoon simplification and
anthropomorphic posing are allowed; photo realism is not required.

Give five integer scores 0–4 for each illustration, with a concrete visible reason
and image location for every score. Scale: 0 absent/unusable; 1 major errors;
2 recognizable but material flaws; 3 coherent with minor flaws; 4 clear and well resolved.

1. Pelican recognition/form: distinctive long bill/pouch and coherent head, neck,
   body, wing and feet; avoid rewarding generic bird decoration.
2. Bicycle structure: wheel, hub, frame, fork, steering, crank and pedal connections;
   essential members and supports should not float or attach absurdly.
3. Riding interaction: readable support/seat and limb-to-cycle contact; the bird
   should read as riding rather than pasted over or intersecting a bicycle.
4. Spatial continuity/occlusion: projection, scale, continuous entities, intersections,
   front/back ordering and visible lines; hidden lines should not show through.
5. Whole-image execution: composition, negative space, legibility, consistent
   palette/line/material language, complete contours and accidental clipping.

Also identify each image's most important defects and strengths. Choose a preferred
image or a tie based on these criteria; explain any difference between your total
scores and preference. Do not reward decoration count, confidence or verbosity.

Save `judgment.json` containing `images` keyed by the neutral IDs, each with five
`scores` in the order above, five corresponding `reasons`, `total`, `strengths` and
`defects`; also include `preference`, `preference_reason`, and `images_actually_viewed`.
Do not search the web, inspect source code or other files, modify the images, ask
for feedback, or infer identity. No desired outcome is specified.
