function decodeUplink(input) {
  return { 
    data: Decode(input.fPort, input.bytes, input.variables)
  };   
}

function str_pad(n) {
  return n.toString(16).padStart(2, '0');
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

function datalog(i,bytes){
  var aa= parseFloat(((bytes[i]<<8 | bytes[1+i])/100).toFixed(2));
  var bb= parseFloat(((bytes[2+i]<<8 | bytes[3+i])/100).toFixed(2));
  var cc= parseFloat(((bytes[4+i]<<8 | bytes[5+i])/10).toFixed(1)); 
  var dd= bytes[6+i];
  var ee= getMyDate((bytes[7+i]<<24 | bytes[8+i]<<16 | bytes[9+i]<<8 | bytes[10+i]).toString(10));
  var string='['+aa+','+bb+','+cc+','+dd+','+ee+']'+',';  
  
  return string;
}

function Decode(fPort, bytes, variables) {
  var decode = {};
  if(fPort==2)
  {
    if(bytes.length==11)
      {
        decode.TempC_SHT=parseFloat(((bytes[0]<<24>>16 | bytes[1])/100).toFixed(2));
        decode.Hum_SHT=parseFloat(((bytes[2]<<24>>16 | bytes[3])/10).toFixed(1));
        decode.TempC_DS=parseFloat(((bytes[4]<<24>>16 | bytes[5])/100).toFixed(2));

        decode.Ext=bytes[6];
        decode.Systimestamp=(bytes[7]<<24 | bytes[8]<<16 | bytes[9]<<8 | bytes[10]);
        decode.Node_type="LHT52";
        return decode;
      }
    else
      {
        decode.Status="RPL data or sensor reset";
        decode.Node_type="LHT52";
        return decode;
      }
  }

  if(fPort==3)
  {
      var data_sum = '';
      for(var i=0;i<bytes.length;i=i+11)
      {
        var data= datalog(i,bytes);
        if(i=='0')
          data_sum=data;
        else
          data_sum+=data;
      }
      return{
      Node_type:"LHT52",
      DATALOG:data_sum,
      };    
    } 
  
  if(fPort==4)
    {
      decode.DS18B20_ID=str_pad(bytes[0])+str_pad(bytes[1])+str_pad(bytes[2])+str_pad(bytes[3])+str_pad(bytes[4])+str_pad(bytes[5])+str_pad(bytes[6])+str_pad(bytes[7]);
      decode.Node_type="LHT52";
      return decode;
    }

  if(fPort==5)
    {
      decode.Sensor_Model=bytes[0];
      decode.Firmware_Version=str_pad((bytes[1]<<8)|bytes[2]);
      decode.Freq_Band=bytes[3];
      decode.Sub_Band=bytes[4];
      decode.Bat_mV=bytes[5]<<8|bytes[6];
      decode.Node_type="LHT52";
      return decode;
    }
}












// ================= 测试数据(只打印,不做断言) =================
// 粘贴到 test-lht52.js 解码器代码下方,运行: node test-lht52.js
function hx(s){ s=s.replace(/\s/g,''); var b=[]; for(var i=0;i<s.length;i+=2) b.push(parseInt(s.substr(i,2),16)); return b; }
function t(name, fPort, hex){
  console.log('--- '+name+'   (fPort='+fPort+', '+hx(hex).length+' 字节) ---');
  console.log('输入: '+hex.toUpperCase());
  console.log('输出: '+JSON.stringify(decodeUplink({fPort:fPort, bytes:hx(hex), variables:{}}).data));
  console.log('');
}

t('C1  f2 实时(真实帧)',   2, '0BF402457FFF016AA0BD0D');
t('C2  f2 经典帧(负温度)', 2, '09FB025DFE0C005F5E1000');
t('C3  f2 长度异常',       2, '010203');
t('C4  f3 两条记录',       3, '0B280B6401F7416AA0C0210B220B5F01F6416AA0C05D');
t('C5  f3 无探头记录',     3, '7FFF0B8A020E416AA0B810');
t('C6  f4 DS18B20 ID',     4, '288663B20000009F');
t('C7  f5 设备状态',       5, '0901200100099C');
t('C8  未知 fPort',        6, '0102');
