# Local test tools

Python 3.12 (standard library), Node 22.22.1, native shell and image viewing.
An SVG renderer is installed read-only, no install needed:

```sh
node /tools/render/render.mjs input.svg preview.png 640
```

Native image viewing can inspect its PNG output. Playwright 1.56.1 is available
at `/tools/animation/node_modules/playwright/index.mjs`; its Chromium headless
shell is installed and PLAYWRIGHT_BROWSERS_PATH is set. It can render a local
HTML or SVG and take screenshots of selected elements or at animation phases.
No image generation. No subagents. No MCP, apps or remote plugins. Keep work
inside /workspace. Use local tools instead of installing another renderer.
