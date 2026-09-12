# Fix: Logo Layout and Component Stylesheet

The logo appeared at its native 1254px size because the merged `index.html` did not load `css/components.css`. That stylesheet contains the intended brand sizing and canvas interaction rules, so its absence caused the header image to expand into the editor workspace.

This fix restores the `components.css` link and adds a small defensive `brand-fix.css` layer. The supplied logo is constrained to a 118×42 header slot, remains inside the brand block, and cannot cover the canvas. The empty canvas state keeps a higher interaction layer so Choose image remains clickable.
