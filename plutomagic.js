let config = {};
let prog;
config.noInitialRun = true;
pluto(config).then(function(mod)
{
	prog = {
		mod: mod,
		malloc: mod.cwrap("malloc", "int", ["int"]),
		free: mod.cwrap("free", "void", ["int"]),
		strcpy: mod.cwrap("strcpy", "void", ["int", "string"]),
		main: mod.cwrap("main", "int", ["int", "array"]),
	};
});

function pluto_fs_read(file)
{
	return prog.mod.FS.readFile(file, { encoding: "utf8" });
}

function pluto_fs_write(file, cont)
{
	let data = utf16_to_utf8(cont);
	let stream = prog.mod.FS.open(file, "w+");
	prog.mod.FS.write(stream, data, 0, data.length, 0);
	prog.mod.FS.close(stream);
}

function pluto_execute(file)
{
	let argv = [ "pluto", file ];
	let argv_ptr = allocateStringArray(prog, argv);
	return prog.main(argv.length, argv_ptr);
}

function utf32_to_utf8(utf8/*: array */, utf32/*: number */)/*: void */
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

function utf16_to_utf8(str)
{
	let arr = [];
	for(let i = 0; i != str.length; ++i)
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

const PTRSIZE = 4;

function allocateString(prog, str)
{
	let ptr = prog.malloc(str.length + 1);
	prog.strcpy(ptr, str);
	return ptr;
}

function allocateStringArray(prog, arr)
{
	let u32arr = new Uint32Array(arr.length);
	for (let i = 0; i != arr.length; ++i)
	{
		u32arr[i] = allocateString(prog, arr[i]);
	}
	let ptr = prog.malloc(PTRSIZE * arr.length);
	var heap = new Uint8Array(prog.mod.HEAPU8.buffer, ptr, PTRSIZE * arr.length);
	heap.set(new Uint8Array(u32arr.buffer));
	return heap;
}
