# Cognitive Suite
N-Back and Cognitive Control Training are mindbuilding activites that with many hours of dedicated practice can improve your executive functioning, working memory, concentration, and arguably intelligence.

I put together my favorite n-back and CCT training websites into one application. The desktop app works offline and stores settings and training history locally on that device. It also has a separate statistics page like Brain Workshop's.

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

[Download the latest Cognitive Suite release](https://github.com/oatzs/cognitive-suite/releases/latest).
Node.js and npm are not required to use these downloads.

- **Windows x64:** download the portable `.exe` and run it directly.
- **macOS Apple Silicon:** download the `arm64.dmg`, open it, and drag the app to Applications.
- **macOS Intel:** download the `x64.dmg`, open it, and drag the app to Applications.
- **Linux x64:** download the `.AppImage`, mark it executable, and run it.

Windows and macOS builds are currently unsigned, so the operating system may
show a security warning on first launch.

## Build from source

Desktop packaging uses Electron and Electron Builder. Release builds require
Node.js 22.12 or newer.

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
manually or when a `v*` tag is pushed.

## License

Original contributions to Cognitive Suite are released under the Unlicense.
The incorporated Quad Box and DocCT code remains subject to their MIT license
notices in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
