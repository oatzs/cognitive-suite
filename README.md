# Cognitive Suite
N-Back and Cognitive Control Training are mindbuilding activites that with many hours of dedicated practice can improve your executive functioning, working memory, concentration, and arguably intelligence.

I put together my favorite n-back and CCT training websites into one executable so I can play it offline and not rely on browser storage. It also has a separate statistics page like Brain Workshop's.

If you want to try it out online:

https://oatzs.github.io/cognitive-suite/

Check out the mindbuilding discord, a great resource: https://discord.gg/brain


Thank you to the original contributors. Check them out here. 

**QuadBox:** 

https://quad-box.netlify.app.

https://github.com/soamsy/quad-box

**CCT:** 

https://docct-cn5.pages.dev/

https://github.com/SafEight/docct

## Progress tracking

![Two months of example cognitive training statistics](docs/statistics-preview.png)

_Statistics are shown with example training data._


## Downloads

Desktop packaging uses Electron and Electron Builder. Use Node.js 22.12 or
newer for release builds.

https://github.com/oatzs/cognitive-suite/releases

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
