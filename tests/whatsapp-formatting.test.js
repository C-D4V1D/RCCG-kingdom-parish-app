import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const api=readFileSync(new URL('../functions/api/[[route]].js',import.meta.url),'utf8');
const app=readFileSync(new URL('../src/js/app.js',import.meta.url),'utf8');
const ctx={};vm.createContext(ctx);
vm.runInContext(api.slice(api.indexOf('function whatsappLiteral'),api.indexOf('function buildFallbackWhatsappMessage')),ctx);
vm.runInContext(app.slice(app.indexOf('function automationsWhatsappPreview'),app.indexOf('function automationsWhatsappSamplesHtml')).replace('return esc(text)','return text'),ctx);
test('source fields cannot open WhatsApp formatting and AI Markdown bold is normalized',()=>{
 assert.equal(ctx.whatsappLiteral('Bro_A *B* `C`'),'Bro\u200b_\u200bA \u200b*\u200bB\u200b*\u200b \u200b`\u200bC\u200b`\u200b');
 assert.equal(ctx.whatsappDraftMarkup('**Title**\n**one\ntwo**'),'*Title*\n*one*\n*two*');
});
test('WhatsApp sample bold is rendered, including emoji, without matching nested or broken tokens',()=>{
 assert.equal(ctx.automationsWhatsappPreview('*💰 NET CREDIT*'),'<b>💰 NET CREDIT</b>');
 assert.equal(ctx.automationsWhatsappPreview('*Today, Sun 18 Oct, is remittance day.*'),'<b>Today, Sun 18 Oct, is remittance day.</b>');
 assert.equal(ctx.automationsWhatsappPreview('*one\ntwo*'),'*one\ntwo*');
 assert.equal(ctx.automationsWhatsappPreview('**wrong**'),'**wrong**');
});
