# Identical tools for both conditions

Linux, native Codex CLI 0.155.1, Node 22.22.1, Python 3.12, shell, live web search and native image viewing. Apps, MCP and remote plugin features are disabled. The local Python does not include Pillow; use standard-library checks or the supplied browser.

Playwright 1.56.1 and its pinned Chromium headless shell are installed read-only. Capture a local HTML animation with:

```sh
node /tools/animation/capture.mjs /workspace/output.html /workspace/checks/capture
```

This records a real-time browser video (two six-second cycles) and PNG samples every 0.5 seconds through one cycle, plus browser errors, blocked network requests, animation timing metadata and actual capture times in report.json. It does not edit the artwork or seek/retime its animation. Use a NEW capture output directory each time. Open its PNGs with native image viewing, including close inspection of contact/occlusion at several phases. The video uses a 1200 by 900 viewport; PNGs can be cropped using browser screenshots from your own script if needed.

The helper and Playwright can also be imported from `/tools/animation/node_modules/playwright/index.mjs`. `PLAYWRIGHT_BROWSERS_PATH` is set. No package installation is required. The browser helper blocks HTTP(S) resources while rendering: output.html must work offline.

The static SVG renderer is also available:

```sh
node /tools/render/render.mjs input.svg preview.png 1200
```

It cannot validate animation. Web research remains available separately through native tools. Do not use image generation. Keep all work inside the isolated workspace.
