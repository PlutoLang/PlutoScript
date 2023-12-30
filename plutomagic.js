let lib, L;
libpluto().then(function(mod)
{
	lib = {
		mod: mod,
		luaL_newstate: mod.cwrap("luaL_newstate", "int", []),
		luaL_openlibs: mod.cwrap("luaL_openlibs", "void", ["int"]),
		luaL_loadstring: mod.cwrap("luaL_loadstring", "void", ["int", "string"]),
		lua_callk: mod.cwrap("lua_callk", "void", ["int", "int", "int", "int", "int"]),
		lua_getglobal: mod.cwrap("lua_getglobal", "void", ["int", "string"]),
		lua_type: mod.cwrap("lua_type", "int", ["int", "int"]),
		lua_pushstring: mod.cwrap("lua_pushstring", "void", ["int", "string"]),
		lua_tolstring: mod.cwrap("lua_tolstring", "string", ["int", "int", "int"]),
		lua_settop: mod.cwrap("lua_settop", "void", ["int", "int"]),
	};

	lib.lua_pop = (L, n) => lib.lua_settop(L, -(n)-1);

	L = lib.luaL_newstate();
	lib.luaL_openlibs(L);
	document.querySelectorAll("script[type=pluto]").forEach(function(script)
	{
		lib.luaL_loadstring(L, script.textContent);
		lib.lua_callk(L, 0, 0, 0, 0);
	});
});

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

function pluto_invoke(name, ...args)
{
	lib.lua_getglobal(L, name);
	if (lib.lua_type(L, -1) != LUA_TFUNCTION)
	{
		throw new Error(name + " is not defined as a function in any Pluto script");
	}
	let nargs = 0;
	args.forEach(arg => {
		if (typeof(arg) != "string")
		{
			throw new Error("Unsupported argument type: " + typeof(arg));
		}
		lib.lua_pushstring(L, arg);
		++nargs;
	});
	lib.lua_callk(L, nargs, 1, 0, 0);
	if (lib.lua_type(L, -1) > LUA_TNIL)
	{
		if (lib.lua_type(L, -1) != LUA_TSTRING)
		{
			throw new Error("Unsupported return type: " + lib.lua_type(L, -1));
		}
		let ret = lib.lua_tolstring(L, -1, 0);
		lib.lua_pop(L, 1);
		return ret;
	}
}
