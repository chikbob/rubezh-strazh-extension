import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

test('FMBA emblem is a true-color PNG with alpha',async()=>{
 const png=await readFile(new URL('../src/assets/emblem-black-v2.png',import.meta.url));
 assert.deepEqual([...png.subarray(1,4)],[0x50,0x4e,0x47]);
 assert.equal(png[25],6);
});
