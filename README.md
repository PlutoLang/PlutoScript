# PlutoScript

Write Pluto, a Lua dialect, anywhere JavaScript works.

## Usage

You simply need to load a suitable WASM build of libpluto, and then PlutoScript itself:

```html
<script src="https://wasm.pluto.do/out/libpluto/0.8.1/libpluto.js"></script>
<script src="https://pluto-lang.org/PlutoScript/plutoscript.js"></script>
```

## Example

A simple example is the Base32 Encoder tool that is [available online here](https://pluto-lang.org/PlutoScript/base32.html).

Barring the script tags needed for PlutoScript's usage, this is the entire source code:

```html
<textarea id="plain"></textarea>
<textarea id="encoded"></textarea>
<script type="pluto">
    document.getElementById("plain"):addEventListener("input", function()
        document.getElementById("encoded").value = require"base32".encode(document.getElementById("plain").value)
    end)
</script>
```

## JavaScript API

- `pluto_require(src)`
- `pluto_load(code)`
- `pluto_invoke(name, ...args)` can be used to invoke a global Pluto function
- `pluto_give_file(name, data)` writes a Uint8Array for Pluto code to read from the file with the given name

## Pluto API

- `js_invoke(name, ...args)` can be used to invoke a global JavaScript function
- `window.__index.__call`: You can call any method on 'window', e.g. `window.alert("Hello")`
- `document.getElementById(x)` returns an Element instance with path `$"#{x}"`
- `document.querySelector(x)` returns an Element instance with path `x`
- `Element.__index`/`Element.__newindex`: You can read and write any property of an Element, e.g. `.value`
- `Element:addEventListener(evt, func)`
- `Element:addClass(name)`
- `Element:removeClass(name)`
