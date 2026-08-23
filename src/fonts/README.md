# Fonts

Anton 400 and Archivo 400/600/700 as woff2, latin subset only (the site is
English only). Copied out of `@fontsource/anton` and `@fontsource/archivo`
5.3.0 (Google Fonts v27 and v25) so that the `@font-face` rules in
`../tokens.css` can own `font-display`, and so every page can preload exactly
these files by a stable path — neither was possible with the packages'
generated CSS. Both faces are under the SIL Open Font License 1.1; the texts
are the `OFL-*.txt` files beside them.

To update: `npm i -D @fontsource/anton @fontsource/archivo`, copy the
`files/*-latin-*-normal.woff2` you need over these, uninstall again.
