function decodeUplink(input) {
  var bytes = input.bytes;
  var data = {};

  // Pt100: resistance at 0 degrees Celsius is 100 ohms.
  function temperatureToResistance(temp) {
    var R0 = 100.0;
    var A = 3.9083e-3;
    var B = -5.775e-7;
    var C = -4.183e-12;
    var temp2 = temp * temp;
    var ratio = 1 + A * temp + B * temp2;
    if (temp < 0) {
      ratio += C * (temp - 100) * temp2 * temp;
    }
    return parseFloat((R0 * ratio).toFixed(3));
  }

  function readTemperature(offset) {
    return (bytes[offset] << 24 >> 16 | bytes[offset + 1]) / 10;
  }

  function resistanceForTemperature(temp) {
    // Outside the Pt100 conversion range, do not report a resistance.
    if (temp < -200 || temp > 850) {
      return null;
    }
    return temperatureToResistance(temp);
  }

  function getzf(num) {
    return num < 10 ? "0" + num : num;
  }

  function getMyDate(timestamp) {
    var date = new Date(timestamp > 9999999999 ? timestamp : timestamp * 1000);
    return date.getFullYear() + "-" + getzf(date.getMonth() + 1) + "-" +
      getzf(date.getDate()) + " " + getzf(date.getHours()) + ":" +
      getzf(date.getMinutes()) + ":" + getzf(date.getSeconds());
  }

  function readTimestamp(offset) {
    return (bytes[offset] * 0x1000000) +
      (bytes[offset + 1] << 16 | bytes[offset + 2] << 8 | bytes[offset + 3]);
  }

  function lengthError(message) {
    return { errors: [message] };
  }

  var i;
  var temp1;
  var temp2;
  var records;
  var resistances;

  switch (input.fPort) {
    case 2:
      if (bytes.length !== 11) {
        return lengthError("FPort 2 requires 11 bytes");
      }
      data.BatV = (bytes[0] << 8 | bytes[1]) / 1000;
      data.Interrupt_flag = bytes[2] & 0x01 ? "TRUE" : "FALSE";
      data.Interrupt_level = bytes[2] & 0x02 ? "HIGH" : "LOW";
      data.TEMP1H_flag = bytes[2] & 0x10 ? "True" : "False";
      data.TEMP1L_flag = bytes[2] & 0x20 ? "True" : "False";
      data.TEMP2H_flag = bytes[2] & 0x04 ? "True" : "False";
      data.TEMP2L_flag = bytes[2] & 0x08 ? "True" : "False";
      temp1 = readTemperature(3);
      temp2 = readTemperature(5);
      data.Temp_Channel1 = temp1 > 2000 || temp1 < -2000 ? 0 : temp1;
      data.Temp_Channel2 = temp2 > 2000 || temp2 < -2000 ? 0 : temp2;
      data.Resistance_Channel1 = resistanceForTemperature(temp1);
      data.Resistance_Channel2 = resistanceForTemperature(temp2);
      data.Data_time = getMyDate(readTimestamp(7));
      data.Node_type = "LTC2-LB";
      return { data: data };

    case 5:
      if (bytes.length < 7) {
        return lengthError("FPort 5 requires at least 7 bytes");
      }
      if (bytes[0] === 0x16) {
        data.SENSOR_MODEL = "LTC2-LB";
      }
      data.SUB_BAND = bytes[4] === 0xff ? "NULL" : bytes[4];
      var bands = {
        1: "EU868", 2: "US915", 3: "IN865", 4: "AU915",
        5: "KZ865", 6: "RU864", 7: "AS923", 8: "AS923_1",
        9: "AS923_2", 10: "AS923_3", 11: "CN470", 12: "EU433",
        13: "KR920", 14: "MA869"
      };
      if (bands[bytes[3]]) {
        data.FREQUENCY_BAND = bands[bytes[3]];
      }
      data.FIRMWARE_VERSION = (bytes[1] & 0x0f) + "." +
        (bytes[2] >> 4 & 0x0f) + "." + (bytes[2] & 0x0f);
      data.BAT = (bytes[5] << 8 | bytes[6]) / 1000;
      return { data: data };

    case 3:
      if (bytes.length === 0 || bytes.length % 11 !== 0) {
        return lengthError("FPort 3 requires complete 11-byte records");
      }
      records = [];
      resistances = [];
      for (i = 0; i < bytes.length; i += 11) {
        // Preserve the original DATALOG temperature order.
        temp1 = readTemperature(4 + i);
        temp2 = readTemperature(2 + i);
        var level = bytes[6 + i] & 0x02 ? "High" : "Low";
        var flag = bytes[6 + i] & 0x01 ? "True" : "False";
        var time = getMyDate(readTimestamp(7 + i));
        records.push("[" + temp1 + "," + temp2 + "," + level +
          "," + flag + "," + time + "],");
        resistances.push({
          Resistance_Channel1: resistanceForTemperature(temp1),
          Resistance_Channel2: resistanceForTemperature(temp2),
          Data_time: time
        });
      }
      data.Node_type = "LTC2-LB";
      data.DATALOG = records.join("");
      data.Resistance_DATALOG = resistances;
      data.PNACKMD = bytes[6] >> 7 & 0x01 ? "True" : "False";
      return { data: data };

    case 7:
      if (bytes.length < 6 || (bytes.length - 2) % 4 !== 0) {
        return lengthError("FPort 7 requires 2 battery bytes and complete 4-byte records");
      }
      data.Bat = (bytes[0] << 8 | bytes[1]) / 1000;
      records = [];
      resistances = [];
      for (i = 2; i < bytes.length; i += 4) {
        temp1 = readTemperature(i);
        temp2 = readTemperature(i + 2);
        records.push("[" + temp1.toFixed(1) + "," + temp2.toFixed(1) + "],");
        resistances.push({
          Resistance_Channel1: resistanceForTemperature(temp1),
          Resistance_Channel2: resistanceForTemperature(temp2)
        });
      }
      data.Node_type = "LTC2-LB";
      data.DATALOG = records.join("");
      data.Resistance_DATALOG = resistances;
      return { data: data };

    default:
      return { errors: ["unknown FPort"] };
  }
}
