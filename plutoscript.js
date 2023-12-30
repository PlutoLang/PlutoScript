const LUA_TNONE = -1;
const LUA_TNIL = 0;
const LUA_TBOOLEAN = 1;
const LUA_TLIGHTUSERDATA = 2;
const LUA_TNUMBER = 3;
const LUA_TSTRING = 4;
const LUA_TTABLE = 5;
const LUA_TFUNCTION = 6;
const LUA_TUSERDATA = 7;
const LUA_TTHREAD = 8;

const LUA_OK = 0;
const LUA_YIELD = 1;

const LUAI_MAXSTACK = 1000000;
const LUA_REGISTRYINDEX = (-LUAI_MAXSTACK - 1000);
const LUA_NOREF = -2;
const LUA_REFNIL = -1;

let lib, L;
libpluto().then(function(mod)
{
	lib = {
		mod: mod,
		malloc: mod.cwrap("malloc", "int", ["int"]),
		luaL_newstate: mod.cwrap("luaL_newstate", "int", []),
		luaL_openlibs: mod.cwrap("luaL_openlibs", "void", ["int"]),
		luaL_loadstring: mod.cwrap("luaL_loadstring", "void", ["int", "string"]),
		lua_callk: mod.cwrap("lua_callk", "void", ["int", "int", "int", "int", "int"]),
		lua_getglobal: mod.cwrap("lua_getglobal", "void", ["int", "string"]),
		lua_type: mod.cwrap("lua_type", "int", ["int", "int"]),
		lua_pushstring: mod.cwrap("lua_pushstring", "void", ["int", "string"]),
		lua_tolstring: mod.cwrap("lua_tolstring", "string", ["int", "int", "int"]),
		lua_settop: mod.cwrap("lua_settop", "void", ["int", "int"]),
		lua_setglobal: mod.cwrap("lua_setglobal", "void", ["int", "string"]),
		lua_newthread: mod.cwrap("lua_newthread", "int", ["int"]),
		lua_xmove: mod.cwrap("lua_xmove", "void", ["int", "int", "int"]),
		lua_closethread: mod.cwrap("lua_closethread", "void", ["int", "int"]),
		lua_status: mod.cwrap("lua_status", "int", ["int"]),
		lua_resume: mod.cwrap("lua_resume", "int", ["int", "int", "int", "int"]),
		lua_gettop: mod.cwrap("lua_gettop", "int", ["int"]),
		lua_pushvalue: mod.cwrap("lua_pushvalue", "int", ["int", "int"]),
		luaL_ref: mod.cwrap("luaL_ref", "int", ["int", "int"]),
		lua_rawgeti: mod.cwrap("lua_rawgeti", "void", ["int", "int", "int"]),
	};

	lib.tmpint = lib.malloc(4);

	lib.lua_pop = (L, n) => lib.lua_settop(L, -(n)-1);

	L = lib.luaL_newstate();
	lib.luaL_openlibs(L);

	lib.luaL_loadstring(L,`--[[ PlutoScript Runtime ]]

js_invoke = coroutine.yield

window = setmetatable({}, { -- silly little thingy to make 'window.alert' work
	__index = function(self, key)
		return setmetatable({}, {
			__call = function(_, ...)
				js_invoke("window_call", key, ...)
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
		return js_invoke("element_index", self.path, key)
	end

	function __newindex(key, value)
		if key == "path" then
			rawset(self, key, value)
		end
		return js_invoke("element_newindex", self.path, key, value)
	end

	function addEventListener(type, callback)
		js_invoke("addEventListener", self.path, type, callback)
	end
end

document = {
	querySelector = |x| -> new Element(x),
	getElementById = |x| -> new Element("#"..x),
}`);
	lib.lua_callk(L, 0, 0, 0, 0);

	document.querySelectorAll("script[type=pluto]").forEach(function(script)
	{
		if (lib.luaL_loadstring(L, script.textContent) == LUA_OK)
		{
			pluto_invoke_impl();
		}
		else
		{
			console.error(lib.lua_tolstring(L, -1, 0));
			lib.lua_pop(L, 1);
		}
	});
});

function pluto_extract(coro, nvals)
{
	let vals = [];
	for (let i = 0; i != nvals; ++i)
	{
		if (lib.lua_type(coro, -(nvals-i)) != LUA_TSTRING)
		{
			throw new Error("Unsupported return type: " + lib.lua_type(coro, -(nvals-i)));
		}
		vals.push(lib.lua_tolstring(coro, -(nvals-i), 0));
	}
	return vals;
}

// Calls the function at -1
function pluto_invoke_impl(...args)
{
	let coro = lib.lua_newthread(L);
	lib.lua_pushvalue(L, -2);
	lib.lua_xmove(L, coro, 1);
	let nargs = 0;
	args.forEach(arg => {
		if (typeof(arg) != "string")
		{
			throw new Error("Unsupported argument type: " + typeof(arg));
		}
		lib.lua_pushstring(coro, arg);
		++nargs;
	});
	for (let initial = true; initial || lib.lua_status(coro) == LUA_YIELD; initial = false)
	{
		let status = lib.lua_resume(coro, L, nargs, lib.tmpint);
		nargs = 0;
		if (status == LUA_YIELD)
		{
			let nres = lib.mod.HEAP32[lib.tmpint / 4];
			if (nres == 0)
			{
				console.error("attempt to call coroutine.yield on main thread");
			}
			else
			{
				switch (lib.lua_tolstring(coro, -nres, 0))
				{
				case "window_call":
					let data = pluto_extract(coro, nres - 1);
					window[data.shift()](...data);
					break;

				case "addEventListener":
					console.assert(nres == 4);
					lib.lua_pushvalue(coro, -1);
					let ref = lib.luaL_ref(coro, LUA_REGISTRYINDEX);
					document.querySelector(lib.lua_tolstring(coro, -3, 0)).addEventListener(lib.lua_tolstring(coro, -2, 0), function()
					{
						lib.lua_rawgeti(L, LUA_REGISTRYINDEX, ref);
						pluto_invoke_impl();
					});
					break;

				case "element_index":
					console.assert(nres == 3);
					let path = lib.lua_tolstring(coro, -2, 0);
					let key = lib.lua_tolstring(coro, -1, 0);
					lib.lua_pop(coro, nres);
					lib.lua_pushstring(coro, document.querySelector(path)[key]); ++nargs;
					break;

				case "element_newindex":
					console.assert(nres == 4);
					document.querySelector(lib.lua_tolstring(coro, -3, 0))[lib.lua_tolstring(coro, -2, 0)] = lib.lua_tolstring(coro, -1, 0);
					break;

				default:
					console.warn("Unhandled command:", lib.lua_tolstring(coro, -nres, 0));
				}
				if (nargs == 0)
				{
					lib.lua_pop(coro, nres);
				}
			}
		}
		else if (status != LUA_OK)
		{
			throw new Error(lib.lua_tolstring(coro, -1, 0));
		}
	}
	let nres = lib.lua_gettop(coro);
	let res = pluto_extract(coro, nres);
	lib.lua_closethread(coro, L);
	lib.lua_pop(L, 2); // pop coroutine & function
	if (nres == 1)
	{
		return res[0];
	}
	return res;
}

function pluto_invoke(name, ...args)
{
	lib.lua_getglobal(L, name);
	if (lib.lua_type(L, -1) != LUA_TFUNCTION)
	{
		throw new Error(name + " is not defined as a function in any Pluto script");
	}
	return pluto_invoke_impl(...args);
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
