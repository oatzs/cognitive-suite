# Third-Party Notices

## Quad Box

This project is based on Quad Box from
https://github.com/soamsy/quad-box.

MIT License

Copyright (c) 2025 The Quad Box Project Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## DocCT

This project includes and adapts DocCT from
https://github.com/SafEight/docct at commit
`32e51f9df2ad1466c7b8d3dc1ee4d77b95c12afc`, including its audio assets.

MIT License

Copyright (c) 2026 cct

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Brain Workshop Reference

Brain Workshop was consulted only as a behavioral reference for statistics.
No Brain Workshop source code or assets are included in this distribution.

## Syllogimous v3

This project includes an adapted snapshot of Syllogimous v3 from
https://github.com/soamsy/Syllogimous-v3 at commit
`9b56def41c4295259a80e655dacc3c1238437358`.

The upstream project credits 4skinSkywalker, ikokusovereignty, soamsy, and
giladkingsley. Its in-app credits identify Federico Trotta (Fredo) as the
original creator. This attribution does not imply that those contributors
endorse Cognitive Suite or its modifications.

Syllogimous v3 is licensed under Creative Commons
Attribution-NonCommercial 3.0 Unported (CC BY-NC 3.0):
https://creativecommons.org/licenses/by-nc/3.0/

The license permits sharing and adaptation with appropriate credit and a link
to the license, but prohibits commercial use without separate permission.
These terms apply to the Syllogimous component under `public/syllogimous/`;
they are separate from the license for Cognitive Suite's original code.

Cognitive Suite embeds Syllogimous in an isolated view and adds a session,
statistics, backup, reset, and navigation bridge. It also hardens shared-profile
validation, replaces dynamic expression evaluation, removes origin-wide
service-worker cleanup, replaces direction icons and feedback sounds, and
removes unused or unlicensed themed media assets.

The vendored Syllogimous graph implementation includes Chart.js 4.4.7,
chartjs-adapter-date-fns 3.0.0, and date-fns under their MIT licenses, plus
d3-delaunay 6.0.4 under the ISC license. Their upstream projects are available
at https://www.chartjs.org/, https://github.com/chartjs/chartjs-adapter-date-fns,
https://date-fns.org/, and https://github.com/d3/d3-delaunay.
