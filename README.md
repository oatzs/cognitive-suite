# Quad Box Cognitive Suite

One application containing the Quad Box 3D n-back trainer, DocCT cognitive
control training, and shared Brain Workshop-style statistics.

![3D Quad N-back](3d-quad.jpg)

The web version remains available at https://quad-box.netlify.app.

## Development

```
npm ci
npm run dev
```

## Tests

```
npm test
```

## Desktop builds

Desktop packaging uses Electron and Electron Builder. Use Node.js 22.12 or
newer for release builds.

```
npm ci
npm run desktop:package
```

Artifacts are written to `release/`:

- Windows: portable `.exe`
- macOS: `.dmg`
- Linux: `.AppImage`

Native artifacts must be built on their matching operating system. The
`desktop-release.yml` workflow builds all supported platforms when run
manually or when a `v*` tag is pushed. Windows and macOS artifacts are unsigned
until signing credentials are configured, so the operating system may show a
security warning.

## Shape pool

To view available shapes:

```
npm run view-shapes
```

DocCT is included under the MIT License. See `THIRD_PARTY_NOTICES.md` for
attribution.
