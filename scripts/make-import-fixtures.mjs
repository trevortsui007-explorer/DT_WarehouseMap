import {writeFileSync,mkdirSync} from 'node:fs';
import {seed} from '../dist/model.js';
import {ensureSpatial} from '../dist/spatial.js';
const m=ensureSpatial(seed());m.racks=m.racks.slice(0,2);m.boundary.doors=[{id:'door-test',name:'导入验证门',side:'bottom',type:'inbound',width:3,offset:5}];mkdirSync('scripts/fixtures',{recursive:true});writeFileSync('scripts/fixtures/valid-layout.json',JSON.stringify(m,null,2));m.racks[1].slots[0].code=m.racks[0].slots[0].code;writeFileSync('scripts/fixtures/invalid-layout.json',JSON.stringify(m,null,2));
