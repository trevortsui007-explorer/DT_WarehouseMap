import {migrate,validate} from './model.js';
import {ensureSpatial,validateArea,spatialWarnings} from './spatial.js';
import {validateDoors} from './doors.js';
export const STORE_KEY='warehouse-layout-library-v1';
const fail=message=>{throw Error(message);};
export function validateLayout(input){
 if(!input||typeof input!=='object'||![1,2].includes(input.schemaVersion))fail('不支持的布局版本；仅支持本编辑器导出的 v1 / v2 布局');
 if(!Array.isArray(input.racks)||input.racks.length>2000)fail('货架列表无效或超过 2000 个');
 JSON.stringify(input,(key,value)=>{if(['__proto__','constructor','prototype'].includes(key))fail('布局包含不支持的字段');return value;});
 const m=migrate(structuredClone(input));if(m.boundary)m.areas??=[];else{if(m.areas?.length)fail('布局有区域但缺少仓库边界');ensureSpatial(m);}const ids=new Set(),codes=new Set();let count=0;
 const id=value=>{if(typeof value!=='string'||! /^[A-Za-z0-9_.:-]{1,120}$/.test(value)||ids.has(value))fail('对象 ID 无效或重复');ids.add(value);};
 const text=(s,label)=>{if(typeof s!=='string'||!s.trim()||s.length>150)fail(`${label}为空或超过 150 字符`);};
 for(const r of m.racks){id(r.id);text(r.name,'货架名称');if(r.spaceId!=='main'||!['FG01','FG02'].includes(r.fgCode))fail('当前仅支持 main 空间及 FG01 / FG02');validate(r,m.racks);if(!Array.isArray(r.slots)||r.slots.length!==r.cols*r.levels)fail(`${r.name} 的货位数量与层列数不一致`);const cells=new Set();for(const s of r.slots){if(++count>20000)fail('货位数超过 20000 个');id(s.id);text(s.code,'货位编码');if(codes.has(s.code))fail(`货位编码重复：${s.code}`);codes.add(s.code);if(!Number.isInteger(s.level)||s.level<1||s.level>r.levels||!Number.isInteger(s.col)||s.col<1||s.col>r.cols)fail('货位层列位置无效');const key=`${s.level}:${s.col}`;if(cells.has(key))fail('同一货架存在重复层列位置');cells.add(key);if(!Number.isSafeInteger(s.cartons)||s.cartons<0)fail('模拟外箱数量必须为非负整数');}}
 if(!Array.isArray(m.areas)||m.areas.length>2000)fail('区域列表无效或超过 2000 个');for(const a of m.areas){id(a.id);text(a.name,'区域名称');validateArea(a);}if(m.boundary.id!=='boundary')fail('仓库边界标识必须为 boundary');id(m.boundary.id);text(m.boundary.name,'边界名称');validateArea(m.boundary,true);validateDoors(m.boundary);for(const d of m.boundary.doors||[]){id(d.id);text(d.name,'门名称');}return m;
}
export function parseLayout(text){if(new TextEncoder().encode(text).length>5*1024*1024)fail('布局文件不能超过 5 MB');let data;try{data=JSON.parse(text);}catch{fail('文件不是有效的 JSON');}return validateLayout(data);}
export function summary(m){return `${m.racks.length} 个货架 · ${m.racks.reduce((n,r)=>n+r.slots.length,0)} 个货位 · ${m.areas.length} 个区域 · ${(m.boundary.doors||[]).length} 个门`;}
export function createLayoutStore(storage){
 function read(){const raw=storage.getItem(STORE_KEY);if(!raw)return null;const data=JSON.parse(raw);if(data.format!==1||!Array.isArray(data.history))fail('本机布局库格式异常，请导入备份恢复');validateLayout(data.current);return data;}
 function load(){const data=read();if(data)return {model:validateLayout(data.current),savedAt:data.savedAt};for(const key of ['warehouse-layout-v3','warehouse-layout-v2','warehouse-layout-v1']){const raw=storage.getItem(key);if(raw)return {model:parseLayout(raw),savedAt:null};}return null;}
 function save(model,label='自动备份',before){const current=validateLayout(model),old=read();let history=old?.history||[];const snapshot=(m,title)=>({id:crypto.randomUUID(),at:new Date().toISOString(),label:title,model:structuredClone(m)});if(before)history=[snapshot(validateLayout(before),'替换前备份'),...history];else if(old&&JSON.stringify(old.current)!==JSON.stringify(current))history=[snapshot(old.current,'上次保存'),...history];history=[snapshot(current,label),...history].slice(0,20);const data={format:1,savedAt:new Date().toISOString(),current,history};while(JSON.stringify(data).length>1400000&&history.length>2)history.pop();if(JSON.stringify(data).length>1800000)fail('布局与备份超过本机存储预算，请先导出 JSON 备份');storage.setItem(STORE_KEY,JSON.stringify(data));return data;}
 return {load,save,history:()=>read()?.history||[],warnings:spatialWarnings};
}
