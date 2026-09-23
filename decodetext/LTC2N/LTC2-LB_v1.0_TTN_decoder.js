function datalog(i,bytes){
  var aa= parseFloat(((bytes[4+i]<<24>>16 | bytes[5+i])/10).toFixed(1)); 
  var bb= parseFloat(((bytes[2+i]<<24>>16 | bytes[3+i])/10).toFixed(1));
  var cc= (bytes[6+i]&0x02) ? "High":"Low";
  var dd= (bytes[6+i]&0x01) ? "True":"False";
  var ee= getMyDate((bytes[7+i]<<24 | bytes[8+i]<<16 | bytes[9+i]<<8 | bytes[10+i]).toString(10));
  var string='['+aa+','+bb+','+cc+','+dd+','+ee+']'+',';  
  
  return string;
}

function getzf(c_num){ 
  if(parseInt(c_num) < 10)
    c_num = '0' + c_num; 

  return c_num; 
}

function getMyDate(str){ 
  var c_Date;
  if(str > 9999999999)
    c_Date = new Date(parseInt(str));
  else 
    c_Date = new Date(parseInt(str) * 1000);
  
  var c_Year = c_Date.getFullYear(), 
  c_Month = c_Date.getMonth()+1, 
  c_Day = c_Date.getDate(),
  c_Hour = c_Date.getHours(), 
  c_Min = c_Date.getMinutes(), 
  c_Sen = c_Date.getSeconds();
  var c_Time = c_Year +'-'+ getzf(c_Month) +'-'+ getzf(c_Day) +' '+ getzf(c_Hour) +':'+ getzf(c_Min) +':'+getzf(c_Sen); 
  
  return c_Time;
}

function Decoder(bytes, port) {
  //LTC2-LB Decode   
  if(port==0x02)
  {
    var decode = {};
    decode.BatV=(bytes[0]<<8 | bytes[1])/1000;
    decode.Interrupt_flag=(bytes[2] & 0x01)? "TRUE":"FALSE";
    decode.Interrupt_level=(bytes[2] & 0x02)? "HIGH":"LOW";      
    decode.TEMP1H_flag= (bytes[2] &0x10)? "True":"False";
    decode.TEMP1L_flag= (bytes[2] &0x20)? "True":"False";
    decode.TEMP2H_flag= (bytes[2] &0x04)? "True":"False";
    decode.TEMP2L_flag= (bytes[2] &0x08)? "True":"False";       
    var Temp_Channel1=parseFloat(((bytes[3]<<24>>16 | bytes[4])/10).toFixed(1)); 
    if (Temp_Channel1>2000 | Temp_Channel1<-2000)
    {
    decode.Temp_Channel1 = 0;
    }
   else
    {
    decode.Temp_Channel1 = Temp_Channel1;
    }
    var Temp_Channel2=parseFloat(((bytes[5]<<24>>16 | bytes[6])/10).toFixed(1)); 
    if (Temp_Channel2>2000 | Temp_Channel2<-2000)
    {
    decode.Temp_Channel2 = 0;
    }
   else
    {
    decode.Temp_Channel2 = Temp_Channel2;
    }
    decode.Data_time= getMyDate((bytes[7]<<24 | bytes[8]<<16 | bytes[9]<<8 | bytes[10]).toString(10));         
    decode.Node_type="LTC2-LB";

    if(bytes.length==11)
      return decode;
  }
  else if(port==3)  
  {
    var pnack= ((bytes[6]>>7)&0x01) ? "True":"False";
    for(var i=0;i<bytes.length;i=i+11)
    {
      var data= datalog(i,bytes);
      if(i=='0')
        data_sum=data;
      else
        data_sum+=data;
    }
    return{
	Node_type:"LTC2-LB",
    DATALOG:data_sum,
    PNACKMD:pnack,
    };    
  }
  else if(port==5)
  {
  	var freq_band;
  	var sub_band;
    var sensor;
    
    if(bytes[0]==0x3D)
      sensor= "LTC2-LB";
      
	  var firm_ver= (bytes[1]&0x0f)+'.'+(bytes[2]>>4&0x0f)+'.'+(bytes[2]&0x0f);
	  
    if(bytes[3]==0x01)
        freq_band="EU868";
  	else if(bytes[3]==0x02)
        freq_band="US915";
  	else if(bytes[3]==0x03)
        freq_band="IN865";
  	else if(bytes[3]==0x04)
        freq_band="AU915";
  	else if(bytes[3]==0x05)
        freq_band="KZ865";
  	else if(bytes[3]==0x06)
        freq_band="RU864";
  	else if(bytes[3]==0x07)
        freq_band="AS923";
  	else if(bytes[3]==0x08)
        freq_band="AS923_1";
  	else if(bytes[3]==0x09)
        freq_band="AS923_2";
  	else if(bytes[3]==0x0A)
        freq_band="AS923_3";
  	else if(bytes[3]==0x0F)
        freq_band="AS923_4";
  	else if(bytes[3]==0x0B)
        freq_band="CN470";
  	else if(bytes[3]==0x0C)
        freq_band="EU433";
  	else if(bytes[3]==0x0D)
        freq_band="KR920";
  	else if(bytes[3]==0x0E)
        freq_band="MA869";
  	
    if(bytes[4]==0xff)
      sub_band="NULL";
	  else
      sub_band=bytes[4];

    var bat= (bytes[5]<<8 | bytes[6])/1000;
    
  	return {
  	  SENSOR_MODEL:sensor,
      FIRMWARE_VERSION:firm_ver,
      FREQUENCY_BAND:freq_band,
      SUB_BAND:sub_band,
      BAT:bat,
  	}
  }
}



/* ---------------------------- 二、小工具 --------------------------------- */
// 十六进制字符串 -> 字节数组："0D AC" 或 "0DAC" 都行
function hex(s) {
  s = String(s).replace(/[^0-9a-fA-F]/g, '');
  var a = [];
  for (var i = 0; i < s.length; i += 2) a.push(parseInt(s.substr(i, 2), 16));
  return a;
}

// 字节数组 -> "0D AC 3F ..."
function hexStr(bytes) {
  var out = [];
  for (var i = 0; i < bytes.length; i++) {
    var t = bytes[i].toString(16).toUpperCase();
    out.push(t.length < 2 ? '0' + t : t);
  }
  return out.join(' ');
}

/* ------------------- 三、想看哪些报文：改这里就行 ------------------------- */
var CASES = [
  // FPort=2 常规上行：11 字节 = 电池(2) | 标志位(1) | CH1(2) | CH2(2) | 时间戳(4)
  // { port: 2, hex: '0DAC 3F 00FD 00C8 6553F100', desc: 'FPort=2 标志位全 1，CH1=25.3℃ CH2=20℃' },
  // { port: 2, hex: '0DAC 00 FF97 8300 6553F100', desc: 'FPort=2 负温度 CH1=-10.5℃，CH2 超量程归 0' },
  // { port: 2, hex: '0DAC3F00FD00C86553F1',       desc: 'FPort=2 只有 10 字节（长度不对）' },

  // FPort=3 每条记录 11 字节 = 保留(2) | CH2(2) | CH1(2) | flag(1) | 时间戳(4)
  // { port: 3, hex: '0000 00FD 00C8 03 6553F100', desc: 'FPort=3 单条记录，flag=0x03' },
  // { port: 3, hex: '0000 00FD 00C8 03 6553F100' + '0000 FF97 8300 80 6553F100',
  //             desc: 'FPort=3 两条记录，第一条 flag=0x03，第二条 flag=0x80(bit7=1)' },
  // { port: 3, hex: '0000 00FD 00C8 03 6553F100' + 'AA', desc: 'FPort=3 共 12 字节（不是 11 的整数倍）' },

  { port: 3, hex: '000000F700FC4266DBFFD0 000000F700FC4266DC000C 000000F700FB4266DC0048 000000F700FB4266DC0084 000000F800FC4266DC00C0', desc: 'ceshi' },


  // // FPort=5 设备状态：7 字节 = 型号(1) | 固件(2) | 频段(1) | 子频段(1) | 电池(2)
  // { port: 5, hex: '3D 01 23 07 FF 0DAC', desc: 'FPort=5 型号 0x3D，固件 1.2.3，AS923，子频段 NULL' },
  // { port: 5, hex: '16 01 23 08 02 0DAC', desc: 'FPort=5 型号 0x16（不在名单内），频段 AS923_1，子频段 2' },

  // // 不支持的端口
  // { port: 1, hex: '0DAC 3F 00FD 00C8 6553F100', desc: 'FPort=1 解码器不支持' },
];

/* ------------------------------ 四、开始打印 ------------------------------ */
for (var c = 0; c < CASES.length; c++) {
  var bytes = hex(CASES[c].hex);
  var out = Decoder(bytes, CASES[c].port);

  console.log('\n============================================================');
  console.log('[' + (c + 1) + '] ' + CASES[c].desc);
  console.log('============================================================');
  console.log('FPort    : ' + CASES[c].port);
  console.log('字节     : ' + hexStr(bytes) + '   (' + bytes.length + ' 字节)');
  console.log('数值     : [' + bytes.join(', ') + ']');
  console.log('原始输出 : ' + JSON.stringify(out, null, 2));

  // FPort=3 的 DATALOG 是一整条拼接字符串，这里按 [] 拆开原样显示（不改数据）
  if (out && typeof out.DATALOG === 'string') {
    var recs = out.DATALOG.match(/\[[^\]]+\]/g) || [];
    console.log('DATALOG 原串 : ' + out.DATALOG);
    for (var k = 0; k < recs.length; k++) {
      console.log('  第' + (k + 1) + '条     : ' + recs[k]);
    }
  }
}

console.log('\n提示：把上面 CASES 里的 hex 换成你自己的报文即可；hex 允许空格与换行。');


