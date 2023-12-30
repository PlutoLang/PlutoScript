# PlutoScript

Write websites using Pluto (a dialect of Lua) instead of JavaScript.

## Usage

You simply need to load a suitable WASM build of libpluto, and then PlutoScript itself:

```HTML
<script src="https://wasm.pluto.do/out/libpluto/0.8.0/libpluto.js"></script>
<script src="https://pluto-lang.org/PlutoScript/plutoscript.js"></script>
```

## Example

A simple example is the Base32 Encoder tool that is [available online here](https://pluto-lang.org/PlutoScript/base32.html).

Barring the script tags needed for PlutoScript's usage, this is the entire source code:

```HTML
<textarea id="plain"></textarea>
<textarea id="encoded"></textarea>
<script type="pluto">
    document.getElementById("plain"):addEventListener("input", function()
        document.getElementById("encoded").value = require"base32".encode(document.getElementById("plain").value)
    end)
</script>
```
