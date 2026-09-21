import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve('dist');
http.createServer(async(req,res)=>{try{const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);const file=path.resolve(root,'.'+(name==='/'?'/index.html':name));if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}const body=await readFile(file);res.setHeader('Content-Type',({'html':'text/html; charset=utf-8','js':'text/javascript','css':'text/css','svg':'image/svg+xml'})[file.split('.').pop()]||'application/octet-stream');res.end(body);}catch{res.writeHead(404);res.end('Not found');}}).listen(5173,'127.0.0.1',()=>console.log('Local: http://127.0.0.1:5173'));
