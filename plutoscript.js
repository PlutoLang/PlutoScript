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

let lib, L, callbacks = [];
libpluto().then(function(mod)
{
	lib = {
		mod: mod,
		malloc: mod.cwrap("malloc", "int", ["int"]),
		luaL_newstate: mod.cwrap("luaL_newstate", "int", []),
		luaL_openlibs: mod.cwrap("luaL_openlibs", "void", ["int"]),
		luaL_loadstring: mod.cwrap("luaL_loadstring", "int", ["int", "string"]),
		luaL_loadbufferx: mod.cwrap("luaL_loadbufferx", "int", ["int", "array", "int", "int", "int"]),
		lua_callk: mod.cwrap("lua_callk", "void", ["int", "int", "int", "int", "int"]),
		lua_getglobal: mod.cwrap("lua_getglobal", "void", ["int", "string"]),
		lua_type: mod.cwrap("lua_type", "int", ["int", "int"]),
		lua_pushnil: mod.cwrap("lua_pushnil", "void", ["int"]),
		lua_pushstring: mod.cwrap("lua_pushstring", "void", ["int", "string"]),
		lua_pushlstring: mod.cwrap("lua_pushlstring", "void", ["int", "array", "int"]),
		lua_pushinteger: mod.cwrap("lua_pushinteger", "void", ["int", "int"]),
		lua_pushnumber: mod.cwrap("lua_pushnumber", "void", ["int", "number"]),
		lua_istrue: mod.cwrap("lua_istrue", "int", ["int", "int"]),
		lua_isinteger: mod.cwrap("lua_isinteger", "int", ["int", "int"]),
		lua_tolstring: mod.cwrap("lua_tolstring", "string", ["int", "int", "int"]),
		lua_tointegerx: mod.cwrap("lua_tointegerx", "int", ["int", "int", "int"]),
		lua_tonumberx: mod.cwrap("lua_tonumberx", "number", ["int", "int", "int"]),
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
		luaL_unref: mod.cwrap("luaL_unref", "int", ["int", "int", "int"]),
		lua_next: mod.cwrap("lua_next", "int", ["int"]),
		lua_createtable: mod.cwrap("lua_createtable", "void", ["int", "int", "int"]),
		lua_settable: mod.cwrap("lua_settable", "void", ["int", "int"]),
	};

	lib.tmpint = lib.malloc(4);

	lib.lua_pop = (L, n) => lib.lua_settop(L, -(n)-1);

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

function pluto_load_script_tags()
{
	document.querySelectorAll("script[type=pluto]").forEach(function(script)
	{
		if (script.getAttribute("src"))
		{
			pluto_require(script.getAttribute("src"));
		}
		else
		{
			pluto_await().then(() => pluto_load(script.textContent));
		}
	});
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
		== LUA_OK)
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
			lib.lua_pushinteger(coro, arg);
		}
		else
		{
			lib.lua_pushnumber(coro, arg);
		}
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
		case LUA_TBOOLEAN:
			vals.push(lib.lua_istrue(coro, -(nvals-i)));
			break;

		case LUA_TSTRING:
			vals.push(lib.lua_tolstring(coro, -(nvals-i), 0));
			break;

		case LUA_TNUMBER:
			if (lib.lua_isinteger(coro, -(nvals-i)))
			{
				vals.push(lib.lua_tointegerx(coro, -(nvals-i), 0));
			}
			else
			{
				vals.push(lib.lua_tonumberx(coro, -(nvals-i), 0));
			}
			break;

		case LUA_TFUNCTION:
			lib.lua_pushvalue(coro, -(nvals-i));
			let ref = lib.luaL_ref(coro, LUA_REGISTRYINDEX);
			vals.push(function()
			{
				lib.lua_rawgeti(L, LUA_REGISTRYINDEX, ref);
				pluto_invoke_impl();
			});
			break;

		case LUA_TTABLE:
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
		coro_ref = lib.luaL_ref(L, LUA_REGISTRYINDEX);
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
			for (let initial = true; initial || lib.lua_status(coro) == LUA_YIELD; initial = false)
			{
				let status = lib.lua_resume(coro, L, nargs, lib.tmpint);
				nargs = 0;
				if (status == LUA_YIELD)
				{
					nres = lib.mod.HEAP32[lib.tmpint / 4];
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
				else if (status != LUA_OK)
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
			lib.luaL_unref(L, LUA_REGISTRYINDEX, coro_ref);
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
	if (lib.lua_type(L, -1) != LUA_TFUNCTION)
	{
		throw new Error(name + " is not defined as a function in any Pluto script");
	}
	return pluto_invoke_impl(...args);
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
