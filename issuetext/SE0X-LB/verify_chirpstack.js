const fs=require('fs');
const src=fs.readFileSync('SE0X-LB-check/SE0X-LB-decoder-chirpstack.js','utf8');
eval(src);
const hex=s=>[...s.replace(/ /g,'').match(/.{2}/g)].map(x=>parseInt(x,16));
const p2 =hex('0E10 FF85 05 09C4 FF9C 04D2 11D7 04D2 0929'); // fPort 2, CH2+CH4
const p5 =hex('F9 12 34 01 00 0E10');                        // fPort 5 设备信息

// ChirpStack v4 / TTN v3: decodeUplink(input)
let r1=decodeUplink({bytes:p2, fPort:2});
console.log('decodeUplink fPort2 keys:',Object.keys(r1), '| data keys:', Object.keys(r1.data||{}).join(','));
console.log('  temp_SOIL2 =',r1.data.temp_SOIL2,'BatV =',r1.data.BatV);
let r2=decodeUplink({bytes:p5, fPort:5});
console.log('decodeUplink fPort5:',JSON.stringify(r2.data));
// 未知 port: 不应报错
let r3=decodeUplink({bytes:p5, fPort:9});
console.log('decodeUplink fPort9 ->',JSON.stringify(r3));
// 旧入口仍可用
console.log('Decoder(bytes,2) ok:',typeof Decoder(p2,2)==='object');
console.log('Decode(2,bytes) ok:',typeof Decode(2,p2)==='object' && Decode(2,p2).water_SOIL4==='45.67');
