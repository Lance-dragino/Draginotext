/* ============================================================================
 * LTC2-LB payload decoder — TTN（官方 v1.0 + 温度→电阻 / 时间戳修正 / 长度校验）
 * ----------------------------------------------------------------------------
 * 本文件基于官方 v1.0 原文，共 5 处改动，全部在代码里用 [改动N] 标记：
 *   每处改动的块首都标了 [改动N]，块内后续行沿用同一标记；
 *   在编辑器里搜「[改动」即可逐处查看（详见 编辑说明_相对官方的全部改动.md）
 *
 *   [改动1] FPort=2  Resistance_Channel1 / Resistance_Channel2     电阻 Ω
 *   [改动1] FPort=3  Resistance_DATALOG（数组，按下标与 DATALOG 的记录一一对应；
 *            每项只有两个电阻值，时间从 DATALOG 里取，不重复携带）
 *
 *   [改动2] 时间戳改为无符号 32 位读法（官方 <<24 在 2038-01-19 之后变负数）
 *   [改动3] 长度校验，畸形报文返回 { errors: ["..."] }，不再输出垃圾记录
 *   [改动4] 入口包装
 *   [改动5] 追加工具函数 ReadTimestamp / Pt100ToResistance
 *
 * 温度→电阻换算：槽位是有符号 int16 ÷ 10 = 摄氏度，再用 IEC 60751 的
 *   Callendar-Van Dusen 正解算电阻：
 *     R(T) = R0 * (1 + A*T + B*T^2)                      T >= 0 ℃
 *     R(T) = R0 * (1 + A*T + B*T^2 + C*(T-100)*T^3)      T <  0 ℃
 *     R0=100  A=3.9083e-3  B=-5.775e-7  C=-4.183e-12
 *   保留 3 位小数；温度超出 -200 ~ 850 ℃（电阻 18.520 ~ 390.481 Ω）返回 null。
 *
 * ⚠️ Resistance_* 返回 null 的三种含义：① 温度超 PT100 量程
 *    ② 探头未接哨兵（-327.6 / -983.0 ℃）③ 异常值。
 *    Resistance_* 直接用已归零的 Temp_Channel* 计算，不会出现
 *    「温度字段说 0 ℃、电阻字段说 null」的矛盾。
 *
 * ⚠️ 与旧版的兼容性：
 *    · 正常报文（长度合法、时间戳 < 2038）的老字段取值与官方完全一致；
 *    · 畸形报文由「输出垃圾数据」变为「返回 errors」；
 *    · 时间戳 >= 2038-01-19 的报文，Data_time 由错的 19xx 变成正确的 20xx。
 *
 * ⚠️ 刻意保持官方原样的地方（未标记 = 未改动）：
 *    · FPort=5 型号判定（v1.2 官方原文为 0x16）、频段表（含 0x0F -> AS923_4）
 *    · 探头未接哨兵仍上报 -327.6 / -983.0 ℃、±2000 归零逻辑
 *    · 字段名与大小写、DATALOG 字符串格式、getMyDate 的本地时区行为
 *
 * 依据：LTCN-Payload-定义整理.md 附录 A / IEC 60751
 * ========================================================================== */

function datalog(i,bytes){
  var aa= parseFloat(((bytes[4+i]<<24>>16 | bytes[5+i])/10).toFixed(1)); 
  var bb= parseFloat(((bytes[2+i]<<24>>16 | bytes[3+i])/10).toFixed(1));
  var cc= (bytes[6+i]&0x02) ? "High":"Low";
  var dd= (bytes[6+i]&0x01) ? "True":"False";
  /* [改动2] 时间戳改用无符号读法。官方写的是 (bytes[..]<<24 | bytes[..]<<16 | ...)，
     其中 <<24 会把最高位当符号位：时间戳 >= 0x80000000（2038-01-19）时
     整个值变成负数，日期会解成 1901 年。 */
  var ee= getMyDate(ReadTimestamp(bytes, 7 + i));
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
    /* [改动3] 新增长度校验（官方没有，长度不对时会输出错误数据） */
    if(bytes.length !== 11)
      return { errors: ["FPort 2 requires 11 bytes"] };
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
    /* [改动2] 时间戳改用无符号读法。官方写的是 (bytes[..]<<24 | bytes[..]<<16 | ...)，
       其中 <<24 会把最高位当符号位：时间戳 >= 0x80000000（2038-01-19）时
       整个值变成负数，日期会解成 1901 年。 */
    decode.Data_time= getMyDate(ReadTimestamp(bytes, 7));         
    decode.Node_type="LTC2-LB";

    /* [改动1] 温度 → 电阻：新增两个字段，不改动上面任何原有字段 */
    decode.Resistance_Channel1= Pt100ToResistance(decode.Temp_Channel1);
    decode.Resistance_Channel2= Pt100ToResistance(decode.Temp_Channel2);

    if(bytes.length==11)
      return decode;
  }
  else if(port==3)  
  {
    /* [改动3] 新增长度校验（官方没有，非 11 倍数会多解出一条 1970 垃圾记录） */
    if(bytes.length === 0 || bytes.length % 11 !== 0)
      return { errors: ["FPort 3 requires complete 11-byte records"] };
    var pnack= ((bytes[6]>>7)&0x01) ? "True":"False";
    /* [改动1] 电阻记录数组，与 DATALOG 逐条对应 */
    var res_list= [];
    for(var i=0;i<bytes.length;i=i+11)
    {
      var data= datalog(i,bytes);
      if(i=='0')
        data_sum=data;
      else
        data_sum+=data;
      /* [改动1] 每条记录追加一条电阻数据；不重复带时间，
         按数组下标与 DATALOG 里的第 k 条记录对应（见文件头说明） */
      res_list.push({
        Resistance_Channel1: Pt100ToResistance((bytes[4+i]<<24>>16 | bytes[5+i])/10),
        Resistance_Channel2: Pt100ToResistance((bytes[2+i]<<24>>16 | bytes[3+i])/10)
      });
    }
    return{
	Node_type:"LTC2-LB",
    DATALOG:data_sum,
    Resistance_DATALOG:res_list,   /* [改动1] 新增字段 */
    PNACKMD:pnack,
    };    
  }
  else if(port==5)
  {
    /* [改动3] 新增长度校验（官方没有） */
    if(bytes.length < 7)
      return { errors: ["FPort 5 requires at least 7 bytes"] };
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
  /* [改动3] 官方没有 default 分支，未知 FPort 会返回 undefined */
  else
  {
    return { errors: ["unknown FPort"] };
  }
}

/* [改动5] 以下为本次追加的工具函数（官方没有）
 * ---------------------------------------------------------------------------
 *
 *   ReadTimestamp(bytes, offset)
 *       从 bytes[offset..offset+3] 读一个「无符号 32 位大端整数」，单位秒。
 *       官方原来的写法是 (bytes[offset]<<24 | bytes[offset+1]<<16 | ...)，
 *       其中 <<24 会把最高位当成符号位：时间戳一旦 >= 0x80000000
 *       （即 2038-01-19 之后）整个值变成负数，日期就会解成 1901 年。
 *       这里改用「高位字节 × 0x1000000」再相加，结果恒为正，等价于 >>> 0。
 *
 *   Pt100ToResistance(temp)
 *       温度 ℃ → PT100 电阻 Ω（供 [改动1] 使用）。
 * ------------------------------------------------------------------------- */
function ReadTimestamp(bytes, offset) {
  return (bytes[offset] * 0x1000000) +
         (bytes[offset + 1] << 16 | bytes[offset + 2] << 8 | bytes[offset + 3]);
}

function Pt100ToResistance(temp) {
  var LTC_R0 = 100;
  var LTC_A = 3.9083e-3;
  var LTC_B = -5.775e-7;
  var LTC_C = -4.183e-12;

  if (typeof temp !== 'number' || !(temp >= -200 && temp <= 850))
    return null;

  var t2 = temp * temp;
  var ratio = 1 + LTC_A * temp + LTC_B * t2;
  if (temp < 0)
    ratio += LTC_C * (temp - 100) * t2 * temp;

  return parseFloat((LTC_R0 * ratio).toFixed(3));
}


/* [改动4] TTN 新版入口：把 errors 正确送到 TTN 的 errors 通道。
 *   官方原文只有旧版 Decoder(bytes, port)，没有这个函数。
 *   用 TTN 旧版格式时不需要它；两种格式都贴上也不冲突。
 *   注意：旧版 Decoder 契约没有 errors 通道，畸形报文会返回一个只含 errors 的
 *        对象，TTN 会把它当成 payload 显示出来。
 * ------------------------------------------------------------------------- */
function decodeUplink(input) {
  var r = Decoder(input.bytes, input.fPort);
  if (r && r.errors) return { errors: r.errors };
  return { data: r };
}