# Cognitive Suite

I put together my favorite n-back and CCT training websites into one executable so I can play it offline and not rely on browser storage. It also has a separate statistics page like Brain Workshop's.

It's also available on this github page though if you want to try it out!
https://oatzs.github.io/cognitive-suite/


Thank you to the original contributors. Check them out here. 
**QuadBox:** https://quad-box.netlify.app.
https://github.com/soamsy/quad-box
**CCT:** https://docct-cn5.pages.dev/
https://github.com/SafEight/docct

![3D Quad N-back](3d-quad.jpg)


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
