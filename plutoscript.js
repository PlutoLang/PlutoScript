//import wrapper from "./libpluto-wrapper.mjs";

let lib, L, callbacks = [];
libpluto().then(function(mod)
{
	lib = window.libplutoWrapper(mod);
	lib.mod = mod;
	lib.tmpint = lib.malloc(4);

	L = lib.luaL_newstate();
	lib.luaL_openlibs(L);
	lib.luaL_loadstring(L,`--[[ PlutoScript Runtime ]]

js_invoke = coroutine.yield

dofile = function(src)
	local chunk, err = load(js_invoke("pluto_cmd_fetch", src))
	if not chunk then
		error(err)
	end
	return chunk()
end

window = setmetatable({}, { -- silly little thingy to make 'window.alert' work
	__index = function(self, key)
		return setmetatable({}, {
			__call = function(_, ...)
				js_invoke(key, ...)
			end
		})
	end
})

class Element
	function __construct(public path)
	end

	function __index(key)
		if Element[key] then
			return Element[key]
		end
		return js_invoke("pluto_cmd_Element_index", self.path, key)
	end

	function __newindex(key, value)
		if key == "path" then
			rawset(self, key, value)
		end
		return js_invoke("pluto_cmd_Element_newindex", self.path, key, value)
	end

	function addEventListener(type, callback)
		js_invoke("pluto_cmd_addEventListener", self.path, type, callback)
	end

	function addClass(name)
		js_invoke("pluto_cmd_addClass", self.path, name)
	end

	function removeClass(name)
		js_invoke("pluto_cmd_removeClass", self.path, name)
	end

	function removeAttribute(name, value)
		js_invoke("pluto_cmd_setAttribute", self.path, name, value)
	end

	function removeAttribute(name)
		js_invoke("pluto_cmd_removeAttribute", self.path, name)
	end
end

document = {
	query = |x| -> new Element(x),
	querySelector = |x| -> new Element(x),
	getElementById = |x| -> new Element("#"..x),
}`);
	lib.lua_callk(L, 0, 0, 0, 0);

	callbacks.forEach(cb => cb());
	callbacks = [];
});

function pluto_await()
{
	return new Promise(resolve => {
		if (lib)
		{
			resolve();
		}
		else
		{
			callbacks.push(resolve);
		}
	});
}

async function pluto_load_script_tags()
{
	const requests = {};
	for (const script of document.querySelectorAll("script[type=pluto]"))
	{
		if (script.getAttribute("src"))
		{
			if (!requests[script.getAttribute("src")])
			{
				requests[script.getAttribute("src")] = fetch(script.getAttribute("src")).then(res => res.arrayBuffer());
			}
		}
	}
	await pluto_await();
	for (const script of document.querySelectorAll("script[type=pluto]"))
	{
		if (script.getAttribute("src"))
		{
			const abRes = await requests[script.getAttribute("src")];
			pluto_load(new Uint8Array(abRes));
		}
		else
		{
			pluto_load(script.textContent);
		}
	}
}

if (document.readyState == "complete" || document.readyState == "interactive")
{
    pluto_load_script_tags();
}
else
{
	window.addEventListener("DOMContentLoaded", pluto_load_script_tags);
}

function pluto_require(src)
{
	return new Promise(resolve => {
		fetch(src).then(res => res.arrayBuffer()).then(cont => pluto_await().then(() => pluto_load(new Uint8Array(cont)).then(resolve)));
	});
}

function pluto_load(cont)
{
	if ((cont instanceof Uint8Array
		? lib.luaL_loadbufferx(L, cont, cont.length, 0, 0)
		: lib.luaL_loadstring(L, cont))
		== lib.LUA_OK)
	{
		return pluto_invoke_impl();
	}
	else
	{
		let err = lib.lua_tolstring(L, -1, 0);
		lib.lua_pop(L, 1);
		return Promise.reject(err);
	}
}

function pluto_push(coro, arg)
{
	switch (typeof(arg))
	{
	case "string":
		lib.lua_pushstring(coro, arg);
		return true;

	case "number":
		if (arg % 1 === 0)
		{
			lib.lua_pushinteger(coro, lib.mod._luaL_openlibs ? arg : BigInt(arg));
		}
		else
		{
			lib.lua_pushnumber(coro, arg);
		}
		return true;

	case "boolean":
		lib.lua_pushboolean(coro, arg ? 1 : 0);
		return true;

	case "object":
		if (arg instanceof Uint8Array)
		{
			lib.lua_pushlstring(coro, arg, arg.length);
		}
		else
		{
			lib.lua_createtable(coro, 0, 0);
			for (key in arg)
			{
				let intkey = parseInt(key);
				if (pluto_push(coro, intkey == key ? intkey + 1 : key))
				{
					if (pluto_push(coro, arg[key]))
					{
						lib.lua_settable(coro, -3);
					}
					else
					{
						lib.lua_pop(coro, 1);
					}
				}
			}
		}
		return true;
	}
	return false;
}

function pluto_extract(coro, nvals)
{
	let vals = [];
	for (let i = 0; i != nvals; ++i)
	{
		switch (lib.lua_type(coro, -(nvals-i)))
		{
		case lib.LUA_TBOOLEAN:
			vals.push(lib.lua_istrue(coro, -(nvals-i)));
			break;

		case lib.LUA_TSTRING:
			vals.push(lib.lua_tolstring(coro, -(nvals-i), 0));
			break;

		case lib.LUA_TNUMBER:
			if (lib.lua_isinteger(coro, -(nvals-i)))
			{
				vals.push(lib.lua_tointegerx(coro, -(nvals-i), 0));
			}
			else
			{
				vals.push(lib.lua_tonumberx(coro, -(nvals-i), 0));
			}
			break;

		case lib.LUA_TFUNCTION:
			lib.lua_pushvalue(coro, -(nvals-i));
			let ref = lib.luaL_ref(coro, lib.LUA_REGISTRYINDEX);
			vals.push(function()
			{
				lib.lua_rawgeti(L, lib.LUA_REGISTRYINDEX, lib.mod._luaL_openlibs ? ref : BigInt(ref));
				pluto_invoke_impl();
			});
			break;

		case lib.LUA_TTABLE:
			let obj = {};
			lib.lua_pushvalue(coro, -(nvals-i));
			lib.lua_pushnil(coro);
			while (lib.lua_next(coro, -2))
			{
				let [key, value] = pluto_extract(coro, 2);
				if (typeof(key) == "number")
				{
					key--;
				}
				obj[key] = value;
				lib.lua_pop(coro, 1);
			}
			lib.lua_pop(coro, 1);
			vals.push(obj);
			break;

		default:
			throw new Error("Unsupported return type: " + lib.lua_type(coro, -(nvals-i)));
		}
	}
	return vals;
}

// Calls the function at -1
function pluto_invoke_impl(...args)
{
	return new Promise((resolve, reject) => {
		let interval, coro, coro_ref, nargs = 0, awaiting_promise = false;

		coro = lib.lua_newthread(L);
		coro_ref = lib.luaL_ref(L, lib.LUA_REGISTRYINDEX);
		lib.lua_xmove(L, coro, 1);
		args.forEach(arg => {
			if (!pluto_push(coro, arg))
			{
				return reject(new Error("Unsupported argument type: " + typeof(arg)));
			}
			++nargs;
		});

		interval = setInterval(function()
		{
			if (awaiting_promise)
			{
				return;
			}
			let err, nres, res;
			for (let initial = true; initial || lib.lua_status(coro) == lib.LUA_YIELD; initial = false)
			{
				let status = lib.lua_resume(coro, L, nargs, lib.tmpint);
				nargs = 0;
				if (status == lib.LUA_YIELD)
				{
					nres = lib.mod.getValue ? lib.mod.getValue(lib.tmpint, "i32") : lib.mod.HEAP32[lib.tmpint / 4];
					if (nres == 0)
					{
						return;
					}
					let data = pluto_extract(coro, nres);
					lib.lua_pop(coro, nres);
					let ret = window[data.shift()](...data);
					if (ret)
					{
						if (ret instanceof Promise)
						{
							awaiting_promise = true;
							ret.then(ret => {
								if (pluto_push(coro, ret))
								{
									nargs = 1;
								}
							}).finally(() => {
								awaiting_promise = false;
							});
							return;
						}
						if (pluto_push(coro, ret))
						{
							nargs = 1;
						}
					}
				}
				else if (status != lib.LUA_OK)
				{
					err = new Error(lib.lua_tolstring(coro, -1, 0));
					break;
				}
			}
			clearInterval(interval);
			if (!err)
			{
				nres = lib.lua_gettop(coro);
				res = pluto_extract(coro, nres);
			}
			lib.lua_closethread(coro, L);
			lib.luaL_unref(L, lib.LUA_REGISTRYINDEX, coro_ref);
			if (!err)
			{
				resolve(nres == 1 ? res[0] : res);
			}
			else
			{
				reject(err);
			}
		}, 1);
	});
}

function pluto_invoke(name, ...args)
{
	lib.lua_getglobal(L, name);
	if (lib.lua_type(L, -1) != lib.LUA_TFUNCTION)
	{
		throw new Error(name + " is not defined as a function in any Pluto script");
	}
	return pluto_invoke_impl(...args);
}

const utf32_to_utf8 = function(utf8/*: array */, utf32/*: number */)/*: void */
{
	// 1
	if (utf32 < 0b10000000)
	{
		utf8.push(utf32);
		return;
	}
	// 2
	const UTF8_CONTINUATION_FLAG = 0b10000000;
	utf8.push((utf32 & 0b111111) | UTF8_CONTINUATION_FLAG);
	utf32 >>= 6;
	if (utf32 <= 0b11111)
	{
		utf8.splice(utf8.length - 1, 0, utf32 | 0b11000000); // 110xxxxx
		return;
	}
	// 3
	utf8.splice(utf8.length - 1, 0, (utf32 & 0b111111) | UTF8_CONTINUATION_FLAG);
	utf32 >>= 6;
	if (utf32 <= 0b1111)
	{
		utf8.splice(utf8.length - 2, 0, utf32 | 0b11100000); // 1110xxxx
		return;
	}
	// 4
	utf8.splice(utf8.length - 2, 0, (utf32 & 0b111111) | UTF8_CONTINUATION_FLAG);
	utf32 >>= 6;
	utf8.splice(utf8.length - 3, 0, utf32 | 0b11110000); // 11110xxx
}

const utf16_to_utf8 = function(str)
{
	let arr = [];
	for(let i = 0; i < str.length; ++i)
	{
		let c = str.charCodeAt(i);
		if ((c >> 10) == 0x36) // Surrogate pair?
		{
			let hi = c & 0x3ff;
			let lo = str.charCodeAt(++i) & 0x3ff;
			c = (((hi * 0x400) + lo) + 0x10000);
		}
		utf32_to_utf8(arr, c);
	}
	return arr;
}

function pluto_give_file(name, data)
{
	if (typeof data == "string")
	{
		data = new Uint8Array(utf16_to_utf8(data));
	}
	let stream = lib.mod.FS.open(name, "w+");
	lib.mod.FS.write(stream, data, 0, data.length, 0);
	lib.mod.FS.close(stream);
}

// Commands for Pluto Runtime

function pluto_cmd_fetch(src)
{
	return new Promise(resolve => {
		fetch(src).then(res => res.arrayBuffer()).then(cont => resolve(new Uint8Array(cont)));
	});
}

function pluto_cmd_Element_index(path, key)
{
	return document.querySelector(path)[key];
}

function pluto_cmd_Element_newindex(path, key, value)
{
	document.querySelector(path)[key] = value;
}

function pluto_cmd_addEventListener(path, evt, f)
{
	document.querySelector(path).addEventListener(evt, f);
}

function pluto_cmd_addClass(path, name)
{
	document.querySelector(path).classList.add(name);
}

function pluto_cmd_removeClass(path, name)
{
	document.querySelector(path).classList.remove(name);
}

function pluto_cmd_setAttribute(path, name, value)
{
	document.querySelector(path).setAttribute(name, value);
}

function pluto_cmd_removeAttribute(path, name)
{
	document.querySelector(path).removeAttribute(name);
}

// DOM Helpers (stolen from https://dev.to/aniket_chauhan/generate-a-css-selector-path-of-a-dom-element-4aim)

function generateSelector(context) {
  let index, pathSelector, localName;

  if (context == "null") throw "not an dom reference";
  // call getIndex function
  index = getIndex(context);

  while (context.tagName) {
    // selector path
    pathSelector = context.localName + (pathSelector ? ">" + pathSelector : "");
    context = context.parentNode;
  }
  // selector path for nth of type
  pathSelector = pathSelector + `:nth-of-type(${index})`;
  return pathSelector;
}

// get index for nth of type element
function getIndex(node) {
  let i = 1;
  let tagName = node.tagName;

  while (node.previousSibling) {
    node = node.previousSibling;
    if (
      node.nodeType === 1 &&
      tagName.toLowerCase() == node.tagName.toLowerCase()
    ) {
      i++;
    }
  }
  return i;
}
