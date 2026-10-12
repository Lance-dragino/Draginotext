function decodeUplink(input) {
  try {
    return { data: Decode(input.fPort, input.bytes, input.variables) };
  } catch (e) {
    return {
      data: {},
      errors: [String((e && e.message) ? e.message : e)]
    };
  }
}


function Decode(fPort, bytes, variables)  {
	var port = fPort;
	var data = {};
	// var decode = {};
	// var value;
	// var mod=(bytes[33]>>7)&0x01;
	// var factor=(bytes[33])&0x0F;	
	// var divisor=bytes[34];
	var data_sum = '';
	var data1 = '';

  function datalog2(i,res,bytes,port){
    var aa;
    var bb;
    var string;
    if(port==7)
      {
        if(res==1)
          {
            aa= parseFloat((bytes[2+i]<<24>>8 | bytes[2+i+1]<<8 | bytes[2+i+2])/100.0).toFixed(2); 
            bb= parseFloat((bytes[2+i+3]<<24>>8 | bytes[2+i+4]<<8 | bytes[2+i+5])/100.0).toFixed(2);
          }
        else
          {
            aa= parseFloat((bytes[2+i]<<24>>16 | bytes[2+i+1])/10.0).toFixed(1); 
            bb= parseFloat((bytes[2+i+2]<<24>>16 | bytes[2+i+3])/10.0).toFixed(1);
          }
          
        string='['+ aa +','+ bb+']'+','; 
      }
    else
      {
        if(res==1)
          aa= parseFloat((bytes[2+i]<<24>>8 | bytes[2+i+1]<<8 | bytes[2+i+2])/100.0).toFixed(2); 
        else
          aa= parseFloat((bytes[2+i]<<24>>16 | bytes[2+i+1])/10.0).toFixed(1); 
       string='['+ aa +']'+',';    
      }

    return string;
  }

  function datalog(i,bytes){
    var aa= parseFloat(((bytes[0+i]<<24>>8 | bytes[1+i]<<8 | bytes[2+i])/100).toFixed(2)); // Inconsistent with Wiki
    var bb= parseFloat(((bytes[3+i]<<24>>8 | bytes[4+i]<<8 | bytes[5+i])/100).toFixed(2)); // Inconsistent with Wiki
    var cc= getMyDate((bytes[7+i]<<24 | bytes[8+i]<<16 | bytes[9+i]<<8 | bytes[10+i]).toString(10));
    var string='['+aa+','+bb+','+cc+']'+',';
    
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

  switch (fPort) {
  case 2:
    if((bytes[0]>>6&0x03)===0x00)// Wiki not mentioned
      data.Calibration_mode="Factory calibration";
    else if((bytes[0]>>6&0x03)==0x01)// Wiki not mentioned
      data.Calibration_mode="User Calibration";
    else
      data.Calibration_mode="Invalid Calibration";// Wiki not mentioned
      data.BatV=((bytes[0]<<8 | bytes[1])&0x3FFF)/1000;
      data.Resolution=(bytes[2] & 0x80)>>7;// Wiki not mentioned. Likely temperature resolution flag
      data.TEMP1H_flag= (bytes[2] &0x10)? "True":"False";// Wiki unclear, bit definition not specified
      data.TEMP1L_flag= (bytes[2] &0x20)? "True":"False";// Wiki unclear, bit definition not specified
      data.TEMP2H_flag= (bytes[2] &0x04)? "True":"False";// Wiki unclear, bit definition not specified
      data.TEMP2L_flag= (bytes[2] &0x08)? "True":"False";// Wiki unclear, bit definition not specified
      data.Temp_Channel1=parseFloat(((bytes[3]<<24>>16 | bytes[4])/10).toFixed(1)); // Negative value not handled
      data.Temp_Channel2=parseFloat(((bytes[5]<<24>>16 | bytes[6])/10).toFixed(1)); //Notice:When using the LTC1-LB module, the temperature of channel 2 is invalid and is always 0.0 degrees.
      data.Data_time= getMyDate((bytes[7]<<24 | bytes[8]<<16 | bytes[9]<<8 | bytes[10]).toString(10));      
      data.Node_type="LTC1N-LB";
  
    if(bytes.length !== 11)
      throw new Error("invalid payload length for FPort 2: "+bytes.length);
    return data;

  case 5:
    { 
      if(bytes[0]==0x3D)//Wiki mentions: Sensor Model: For LTC1/LTC2-LB/LS, this value is 0x3D
        data.SENSOR_MODEL= "LTC1N-LB";
        
      if(bytes[4]==0xff)
        data.SUB_BAND="NULL";
      else
        data.SUB_BAND=bytes[4];
      
      if(bytes[3]==0x01)
        data.FREQUENCY_BAND="EU868";
      else if(bytes[3]==0x02)
        data.FREQUENCY_BAND="US915";
      else if(bytes[3]==0x03)
        data.FREQUENCY_BAND="IN865";
      else if(bytes[3]==0x04)
        data.FREQUENCY_BAND="AU915";
      else if(bytes[3]==0x05)
        data.FREQUENCY_BAND="KZ865";
      else if(bytes[3]==0x06)
        data.FREQUENCY_BAND="RU864";
      else if(bytes[3]==0x07)
        data.FREQUENCY_BAND="AS923";
      else if(bytes[3]==0x08)
        data.FREQUENCY_BAND="AS923_1";
      else if(bytes[3]==0x09)
        data.FREQUENCY_BAND="AS923_2";
      else if(bytes[3]==0x0A)
        data.FREQUENCY_BAND="AS923_3";
      else if(bytes[3]==0x0B)
        data.FREQUENCY_BAND="CN470";
      else if(bytes[3]==0x0C)
        data.FREQUENCY_BAND="EU433";
      else if(bytes[3]==0x0D)
        data.FREQUENCY_BAND="KR920";
      else if(bytes[3]==0x0E)
        data.FREQUENCY_BAND="MA869";
        
      data.FIRMWARE_VERSION= (bytes[1]&0x0f)+'.'+(bytes[2]>>4&0x0f)+'.'+(bytes[2]&0x0f);
      data.BAT= (bytes[5]<<8 | bytes[6])/1000;
      data.Ch1_calibration_value= bytes[7]<<8 | bytes[8];// Wiki not mentioned
      data.Ch2_calibration_value= bytes[9]<<8 | bytes[10];// Wiki not mentioned

    }
    return data;

  case 3:
    var pnack= ((bytes[6]>>7)&0x01) ? "True":"False";// Wiki not mentioned
    for(var i=0;i<bytes.length;i=i+11)
    {
      var data1= datalog(i,bytes);
      if(i=='0')
        data_sum=data1;
      else
        data_sum+=data1;
    }
    data.Node_type="LTC1N-LB";
    data.DATALOG=data_sum;
    data.PNACKMD=pnack;
    return data;

  case 7:
  case 8:
    // var Bat= (bytes[0]<<8 | bytes[1])/1000;
    var Bat= ((bytes[0]<<8 | bytes[1]) & 0x3FFF)/1000;
    var res=(bytes[0]&0x80)>>7;// Wiki not mentioned
    var bytelen;
    if(fPort==7)
    {
      if(res==1)
      bytelen=6;
      else
      bytelen=4;
    }
    else 
    {
      if(res==1)
        bytelen=3;
      else
        bytelen=2;
    }
    for(var j=0;j<bytes.length-2;j=j+bytelen)
    {
      data1= datalog2(j,res,bytes,fPort);
      if(j=='0')
        data_sum=data1;
      else
        data_sum+=data1;
    }
    data.Node_type="LTC1N-LB";
    data.DATALOG=data_sum;
    data.Bat=Bat;
    return data;
    
  default:
    throw new Error("unknown FPort: "+fPort);
}
}


/* ===========================================================================
 * ↓↓↓ 本地测试尾巴：把这一整段复制到你解码器源码的最后面 ↓↓↓
 *
 *   node 你的解码器文件.js             → 进入交互，一行一帧，q 退出
 *   node 你的解码器文件.js 2 0BB8...   → 只跑一帧就退出（不想进交互时用）
 *
 * 交互里：
 *   2 0BB8 00 00FA 0000 66DBFFD0     输入 fPort + hex
 *   - 0000 0000 00FC 42 66DBFFD0     开头写 - ，沿用上一次的 fPort
 *   q                                退出
 *
 * 注意：每行第一个 token 一定当成 fPort，所以 hex 必须写在 fPort 后面。
 *
 * 只有 Node 环境才执行，贴到 ChirpStack / TTN 上这段是空操作。
 * 刻意保持 ES5 写法（var / function / 不用箭头函数），避免影响整份文件的 ES5 检查。
 * 时间按 UTC 输出；不想要就把 process.env.TZ 那行注释掉。
 * =========================================================================*/
if (typeof process !== 'undefined' && process.versions && process.versions.node) {
  process.env.TZ = 'UTC';

  function ltcnTestDecode(fPort, hex) {
    var clean = String(hex).replace(/[^0-9a-fA-F]/g, '');
    var bytes = [];
    var i;

    if (!clean.length || clean.length % 2 !== 0) {
      console.log('  ! hex 长度不对: ' + clean.length + ' 个字符');
      return;
    }
    for (i = 0; i < clean.length; i += 2) bytes.push(parseInt(clean.substr(i, 2), 16));

    var hs = [];
    for (i = 0; i < bytes.length; i++) hs.push(('0' + bytes[i].toString(16).toUpperCase()).slice(-2));

    console.log('');
    console.log('fPort : ' + fPort + '        hex : ' + hs.join(' ') + '  (' + bytes.length + ' 字节)');

    var out;
    try {
      if (typeof decodeUplink === 'function') {
        out = decodeUplink({ fPort: fPort, bytes: bytes, variables: {} });
      } else {
        out = { data: Decode(fPort, bytes, {}) };
      }
    } catch (e) {
      console.log('  THROW : ' + (e && e.message ? e.message : e));
      return;
    }

    var errs = (out && out.errors) ? out.errors : null;
    var data = (out && typeof out === 'object' && 'data' in out) ? out.data : out;

    if (errs && errs.length) console.log('  errors: ' + errs.join('; '));

    if (data === undefined) {
      console.log('  (没有返回 data)');
    } else if (data && typeof data === 'object' && !Array.isArray(data)) {
      var keys = Object.keys(data);
      var k;
      if (!keys.length) console.log('  (空对象 {})');
      for (k = 0; k < keys.length; k++) {
        var v = data[keys[k]];
        console.log('  ' + keys[k] + ' : ' + (typeof v === 'string' ? v : JSON.stringify(v)));
      }
    } else {
      console.log('  ' + data);
    }
    console.log('  → ' + JSON.stringify(data));
  }

  /* 命令行带了参数：跑一帧就退出 */
  if (process.argv[2] !== undefined && process.argv[3] !== undefined) {
    ltcnTestDecode(Number(process.argv[2]), process.argv.slice(3).join(''));
  } else {
    /* 没带参数：进交互 */
    var readline = require('readline');
    var rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    var lastPort = null;

    console.log('输入： <fPort> <hex>      沿用上一次 fPort 就用 - <hex>      q 退出');
    rl.setPrompt('> ');
    rl.prompt();

    rl.on('line', function (line) {
      var t = line.trim();
      if (t === 'q' || t === 'quit' || t === 'exit') return rl.close();
      if (!t) return rl.prompt();

      var m = t.split(/\s+/);
      var fPort, hex;

      if (m[0] === '-' || m[0] === '.') {
        if (lastPort === null) {
          console.log('  还没设过 fPort，第一行写成： <fPort> <hex>');
          return rl.prompt();
        }
        fPort = lastPort;
        hex = m.slice(1).join('');
      } else {
        if (!/^\d{1,3}$/.test(m[0]) || m.length < 2) {
          console.log('  格式： <fPort> <hex>      （沿用上一次 fPort： - <hex>）');
          return rl.prompt();
        }
        fPort = Number(m[0]);
        hex = m.slice(1).join('');
      }

      if (!hex.replace(/[^0-9a-fA-F]/g, '').length) {
        console.log('  hex 是空的');
        return rl.prompt();
      }

      lastPort = fPort;
      ltcnTestDecode(fPort, hex);
      rl.prompt();
    });

    rl.on('close', function () { console.log(''); });
  }
}





