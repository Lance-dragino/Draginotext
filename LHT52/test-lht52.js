// ================= LHT52 Decoder (fPort 2/3/4/5) =================
function decodeUplink(input) {
  return { data: Decode(input.fPort, input.bytes, input.variables) };
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

function Decode(fPort, bytes, variables) {

var decode = {};

// ---------- fPort=2: realtime (11 bytes) ----------
if(fPort==2)
{
  if(bytes.length==11)
  {
    decode.TempC_SHT=parseFloat(((bytes[0]<<24>>16 | bytes[1])/100).toFixed(2));
    decode.Hum_SHT=parseFloat(((bytes[2]<<24>>16 | bytes[3])/10).toFixed(1));
    decode.TempC_DS=parseFloat(((bytes[4]<<24>>16 | bytes[5])/100).toFixed(2));
    decode.Ext=bytes[6];                      // raw byte, no assumption
    decode.Systimestamp=getMyDate((bytes[7]<<24 | bytes[8]<<16 | bytes[9]<<8 | bytes[10].toString(10) ));
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

// ---------- fPort=3: history records, 11 bytes each, object style ----------
if(fPort==3)
{
  var recs=[];
  for(var i=0;i+10<bytes.length;i=i+11)
  {
    var dsRaw=(bytes[i]<<8)|bytes[1+i];       // unsigned 16-bit for 0x7FFF check
    var rec={};
    if(dsRaw==0x7FFF)                         // no probe reading
      rec.TempC_DS=null;                      // change to raw value if you prefer 327.67
    else
      rec.TempC_DS=parseFloat((((bytes[i]<<24>>16)|bytes[1+i])/100).toFixed(2));
      rec.TempC_SHT=parseFloat(((bytes[2+i]<<8|bytes[3+i])/100).toFixed(2));
      rec.Hum_SHT=parseFloat(((bytes[4+i]<<8|bytes[5+i])/10).toFixed(1));
      rec.Ext=bytes[6+i];                       // dd: raw byte as-is
      rec.Systimestamp=getMyDate((bytes[7+i]<<24|bytes[8+i]<<16|bytes[9+i]<<8|bytes[10+i].toString(10)));
      // rec.Node_type="LHT52";
      recs.push(rec);
  }
  return { Node_type:"LHT52", DATALOG: recs };
}

// ---------- fPort=4: DS18B20 ID (8 bytes) ----------
if(fPort==4)
{
  decode.DS18B20_ID=str_pad(bytes[0])+str_pad(bytes[1])+str_pad(bytes[2])+str_pad(bytes[3])+str_pad(bytes[4])+str_pad(bytes[5])+str_pad(bytes[6])+str_pad(bytes[7]);
  decode.Node_type="LHT52";
  return decode;
}

// ---------- fPort=5: device status (7 bytes) ----------
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

return decode;
}





// =====================================================================
// Below: simulate an uplink frame from the gateway and feed it to your decoder
// =====================================================================

function runTest(name, fPort, bytes) {
  console.log('========== ' + name + ' ==========');
  // simulate one uplink message
  var input = { fPort: fPort, bytes: bytes, variables: {} };
  var result = decodeUplink(input);
  console.log('input bytes : [' + bytes.join(', ') + ']');
  console.log('decode out  :', JSON.stringify(result, null, 2));
  console.log('base64      : ' + Buffer.from(bytes).toString('base64') + '   <- use this in TTN console test');
  console.log('');
}

// 1) fPort=2: realtime data (11 bytes)
//    Temp 25.55 C | Hum 60.5% | DS18B20 -5.00 C | Ext sensor 0 | timestamp 1600000000
runTest('1) fPort=2 realtime data (11 bytes)', 2,
  [0x09, 0xFB, 0x02, 0x5D, 0xFE, 0x0C, 0x00, 0x5F, 0x5E, 0x10, 0x00]);

// 2) fPort=3: history records, 11 bytes per record (2 records = 22 bytes)
runTest('2) fPort=3 history data (2 records, 22 bytes)', 3,
  [0x09, 0xFB, 0x09, 0x60, 0x00, 0xCD, 0x01, 0x5F, 0x5E, 0x10, 0x00,
   0x07, 0xD1, 0x15, 0xAE, 0x00, 0x96, 0x00, 0x5F, 0x5E, 0x1E, 0x10]);

// // 3) fPort=4: DS18B20 sensor ID (8 bytes ROM code)
// runTest('3) fPort=4 DS18B20 ID (8 bytes)', 4,
//   [0x28, 0xFF, 0xAA, 0x01, 0x4B, 0x12, 0x34, 0x56]);

// // 4) fPort=5: device version info (7 bytes) -> battery 0x0E74 = 3700 mV
// runTest('4) fPort=5 version info (7 bytes)', 5,
//   [0x01, 0x01, 0x02, 0x04, 0x00, 0x0E, 0x74]);

// // 5) fPort=2 with wrong length -> should return "RPL data or sensor reset"
// runTest('5) fPort=2 wrong length (reset hint)', 2, [0x01, 0x02, 0x03]);
