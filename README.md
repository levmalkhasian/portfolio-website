# Levon Malkhasian — Portfolio

Personal portfolio site, live at **[levmalk.com](https://levmalk.com)**.

Static HTML/CSS/vanilla JS with no build step and no dependencies.
`index.html`.

## Tech

- **Frontend**: HTML5, CSS3 (custom properties, flexbox/grid), vanilla JavaScript
- **Type**: Inter (Google Fonts); the nav signature is Better Grade, baked into the markup
  as SVG outlines rather than loaded as a webfont
- **Icons**: Font Awesome (UI), Simple Icons (tech stack, as CSS masks)
- **Forms**: Formspree
- **Hosting**: GitHub Pages

## Layout

```
index.html              the whole page
src/
  styles.css            site styles
  script.js             nav, typing animation, clock, contact form
  tech-icons.css        tech-stack glyphs as CSS mask data URIs
  github-activity.css   live GitHub widget styles
  github-activity.js    live GitHub widget (heatmap + recent activity)
assets/
  logos/                company logos for the experience timeline  ← tracked
images/                 favicons, resume PDF, working artwork      ← gitignored
```

### Where assets go

`images/` and `fonts/` are gitignored as scratch space. **Anything the live site loads must
go in `assets/`** — a new file dropped in `images/` will never be committed and the deployed
page will 404 on it. Files already tracked under `images/` (favicons, `lm-logo.png`, the
resume PDF) keep working; replacing the resume at the same path still shows as a change.

## Regenerating the nav signature

The signature is Better Grade (Heinzel Studio). The font itself is **not** shipped — the six
glyphs of "L Malk" are converted to SVG outline paths and inlined into `index.html`. Those
paths are used only as a clip mask; the visible ink is a single wide stroke (`.sig-pen`) that
follows the letters in writing order, animated with `stroke-dashoffset` so it draws itself.

This avoids a 28KB webfont download, removes any font-loading flash, and keeps the licensing
position clean — embedding a few glyph outlines as logo artwork is much closer to ordinary
desktop use than redistributing the whole font file.

To rebuild the outlines (e.g. to change the wording), with `fonttools` installed:

```python
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.misc.transform import Transform

f = TTFont('/path/to/BetterGrade.ttf')
cmap, gs, hmtx = f.getBestCmap(), f.getGlyphSet(), f['hmtx']
MAXY = 1484.2857142857142   # max ink Y of the run — flips font Y-up to SVG Y-down
x, parts = 0, []
for ch in 'L Malk':
    g = cmap[ord(ch)]
    pen = SVGPathPen(gs)
    gs[g].draw(TransformPen(pen, Transform(1, 0, 0, -1, x, MAXY)))
    if pen.getCommands():
        parts.append(pen.getCommands())
    x += hmtx[g][0]
print(' '.join(parts))
```

Replace the `<path>` inside `<clipPath id="sig-clip">` in `index.html`. If the wording
changes you must also re-author the `.sig-pen` path so it traces the new letters — see the
comment above `.sig-pen` in `src/styles.css`.

## Notes

- **Font Awesome loads after `styles.css`**, so a bare class selector loses the cascade to
  its rules. Scope icon overrides (e.g. `.project-header .folder-icon`) or they silently
  won't apply.
- The GitHub widget caches in `localStorage` for 45 minutes and degrades to a static card
  when GitHub's unauthenticated 60-req/hour/IP limit is hit.

## Contact

- **Email**: levonmalkhasian@gmail.com
- **GitHub**: [levmalkhasian](https://github.com/levmalkhasian)
- **LinkedIn**: [levonmalkhasian](https://linkedin.com/in/levonmalkhasian)

---

© 2026 Levon Malkhasian
