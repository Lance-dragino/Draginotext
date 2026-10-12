// 日志处理函数
function datalog(i,bytes){
    var aa = parseFloat(((bytes[4+i]<<24>>16 | bytes[5+i])/10).toFixed(1));
    var bb = parseFloat(((bytes[2+i]<<24>>16 | bytes[3+i])/10).toFixed(1));
    var cc = (bytes[6+i] & 0x02)?"HIGH":"LOW";//LTC2N无中断
    var dd = (bytes[6+i] & 0x01)?"TURE":"FALSE";//LTC2N无中断
    var ee = getMyDate(bytes[7+i]<<24 | bytes[8+i]<<16 | bytes[9+i]<<8 | bytes[10+i]);
    var string = ['+aa+','+bb+','+cc+','+dd+','+ee+']+',';
    
    return string;
}


// 补零函数
function getzf(c_num){ 
    if(parseInt(c_num) < 10)
        c_num = '0' + c_num;
    
    return c_num; 
}

// 时间戳转换
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

// LTC2N decode
function Decoder(bytes, port) {
    if(port==0x02){
        var decode = {};
        decode.BatV = (bytes[0]<<8 | bytes[1])/1000;
        decode.Interrupt_Flag = (bytes[2] & 0x01)? "TURE":"FALSE";
        decode.Interrupt_Level = (bytes[2] & 0x02)?"HIGHT":"LOW";
        decode.TEMP1H_flag = (bytes[2] & 0x10)? "TURE":"FALSE";
        decode.TEMP1L_flag = (bytes[2] & 0x20)? "TURE":"FALSE";
        decode.TEMP2H_flag = (bytes[2] & 0x04)? "TURE":"FALSE";
        decode.TEMP2L_flag = (bytes[2] & 0x08)? "TURE":"FALSE";
        decode.LCT1_button_flag = (bytes[2] & 0x40)? "TURE":"FALSE";//固件v1.3.0新增

        // 超出范围-2000~2000判断为0（规格书无相关说明）
        var Channel1Temperature = parseFloat(((bytes[3]<<24>>16 | bytes[4])/10).toFixed(1));
        if(Channel1Temperature<-2000|Channel1Temperature>2000){
            decode.Channel1Temperature = 0;//或者输出"NULL"？
        }else{
            decode.Channel1Temperature =  Channel1Temperature;
        }

        var Channel2Temperature = parseFloat(((bytes[5]<<24>>16 | bytes[6])/10).toFixed(1));
        if(Channel2Temperature<-2000|Channel2Temperature>2000){
            decode.Channel2Temperature = 0;//"NULL"？
        }
        else{
            decode.Channel2Temperature =  Channel2Temperature;
        }

        decode.Datetime = getMyDate((bytes[7]<<24 | bytes[8]<<16 | bytes[9]<<8 | bytes[10]).toString(10));
        decode.Node_type = "LTC2N";

        if(bytes.length===11)return decode;
        
    }
    else if(port==3)
    {
        var pnack= ((bytes[6]>>7)&0x01) ? "True":"False";//？
        for(var i=0;i<bytes.length;i=i+11){
            var data_sum = '';
            var data = datalog(i,bytes);
            if(i==0){
                data_sum = data;
            }
            else{
                data_sum+= data;
            }
        }
        return{
            Node_type:"LTC2N",
            DATALOG:data_sum,
            PNACKMD:pnack,
        } 
    }
    else if(port==5)
    {
        var SensorModel;
        if(bytes[0]==0x3D){
            SensorModel = 'LTC2N';
        }
        var Firmware_Version = (bytes[1]&0x0f)+'.'+(bytes[2]>>4&0x0f)+'.'+(bytes[2]&0x0f);
        var freq_band;
        
        
    }
}