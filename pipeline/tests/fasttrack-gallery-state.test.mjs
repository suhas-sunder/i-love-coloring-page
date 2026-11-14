import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';
const code = ts.transpileModule(await readFile('src/lib/coloring/galleryState.ts','utf8'), {compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
const {readGallerySession, sortGalleryEntries, writeGallerySession} = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);

test('gallery recovery rejects corrupt data and validates filters, limits and sort',()=>{
 assert.equal(readGallerySession('{',[],6352),null);
 assert.equal(readGallerySession(JSON.stringify({version:2,query:'cat',filters:[]}),[],6352),null);
 const recovered=readGallerySession(JSON.stringify({version:1,query:'a'.repeat(400),filters:['cats','fake','cats',null],sort:'random',visibleCount:500000,expanded:true}),['cats'],120);
 assert.deepEqual(recovered,{query:'a'.repeat(200),filters:['cats'],sort:'recommended',visibleCount:120,expanded:true});
 assert.equal(readGallerySession('x'.repeat(8001),[],1),null);
});
test('alphabetical browsing is deterministic, numeric-aware and membership-preserving',()=>{
 const entries=[{title:'Cat Design 10',path:'/c'},{title:'Dog',path:'/d'},{title:'Cat Design 2',path:'/b'},{title:'Cat Design 2',path:'/a'}];
 const original=structuredClone(entries);
 assert.deepEqual(sortGalleryEntries(entries,'title-asc').map(x=>x.path),['/a','/b','/c','/d']);
 assert.deepEqual(sortGalleryEntries(entries,'title-desc').map(x=>x.path),['/d','/c','/a','/b']);
 assert.equal(sortGalleryEntries(entries,'recommended'),entries);
 assert.deepEqual(entries,original);
});
test('blocked browser storage does not prevent discovery',()=>{
 const previous=Object.getOwnPropertyDescriptor(globalThis,'sessionStorage');
 Object.defineProperty(globalThis,'sessionStorage',{configurable:true,get(){throw new Error('storage blocked')}});
 try {assert.doesNotThrow(()=>writeGallerySession('scope',{query:'cat',filters:[],sort:'recommended',visibleCount:48,expanded:false}));}
 finally {if(previous)Object.defineProperty(globalThis,'sessionStorage',previous);else delete globalThis.sessionStorage;}
});
