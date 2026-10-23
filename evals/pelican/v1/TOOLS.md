# Available environment

Linux, Node 22.22.1, Python 3.12, native Codex CLI 0.155.1. The shell, live web
search and native image viewing are available. Apps/MCP/remote plugins are disabled.

An identical read-only installation of `@resvg/resvg-js` 2.6.2 is provided to both
conditions. Render an SVG to PNG with:

```sh
node /tools/render/render.mjs input.svg output.png
node /tools/render/render.mjs input.svg detail.png 1800
```

The optional final number sets the output width with proportional height; it does
not edit the SVG. The renderer uses a white background and system fonts. Native
image viewing can inspect the resulting PNG. The SVG is editable text; no editor
or additional package is mandatory. Network requests may use the declared proxy.
