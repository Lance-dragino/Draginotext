/*
 * Thermostat1 payload decoder v1.1  (TTN v3 / ChirpStack v4, same file)
 * Prepared 2026-10-14 by Dragino support. Handles BOTH firmware generations:
 *   v1.0          -> 4-byte routine frame (room temperature + sensor source only)
 *   v1.1 and v1.2 -> 8-byte routine frame (+ cooling / heating setpoint)
 * so no firmware version check is needed before using it.
 * ---------------------------------------------------------------------
 * Base: official Dragino "Thermostat1_v1.0_decoder.txt"
 *       https://github.com/dragino/dragino-end-node-decoder/blob/main/Thermostat1/Thermostat1_v1.0_decoder.txt
 * Spec: https://wiki.dragino.com/docs/LoRaWAN-End-Node/smart-home-controls/thermostat1/
 *
 * What v1.1 fixes / adds (see README.md for the full list):
 *   1. type 0x01: signed 16-bit temperature (0x8000 sign bit)  -> negative degF now correct
 *      type 0x01: internal/external per wiki (01=internal, 00=external); old file had it inverted
 *      type 0x01: if the periodic frame is the 8-byte form, the setpoint fields are decoded too
 *   2. type 0x02: full feature table 0x01-0x25 (old file stopped at 0x0D and mis-mapped 0x0E+)
 *   3. type 0x03: structured object (old file emitted a comma string and never set "type")
 *   4. feature values are decoded by type: degF*10 / calibrate raw-5 / schedule minutes + HH:MM / enums
 *   5. fPort 3 datalog and fPort 5 device status also handled (old file: status only)
 *   6. unknown input never throws; always returns an object + warnings
 *
 * Firmware notes (official Thermostat1_changelog):
 *   v1.1  added "Setcool_temp" and "Setheat_temp" to the payload
 *         -> the 8-byte routine frame starts at v1.1; v1.0 units send 4 bytes only
 *   v1.2  fixed "incorrect data uploaded via datalog" (the verified 11-byte record layout)
 *         and added a Celsius set command: append 0x01 to the 5-byte command,
 *         e.g. 02 02 02 00 64 01 = set cooling to 10 C (= 50 F)
 *
 * IMPORTANT: no existing field/register carries the live relay outputs (Y1/Y2/W1/W2/G/O-B).
 * A payload formatter cannot invent them - that needs a firmware addition.
 */

/* set to true if you do not want a warning on every 4-byte routine uplink */
var QUIET_4BYTE_WARNING = false;

/* ----------------------------- helpers ----------------------------- */

var FREQ_BAND = {
  0x01: 'EU868', 0x02: 'US915', 0x03: 'IN865', 0x04: 'AU915',
  0x05: 'KZ865', 0x06: 'RU864', 0x07: 'AS923', 0x08: 'AS923_1',
  0x09: 'AS923_2', 0x0A: 'AS923_3', 0x0B: 'CN470', 0x0C: 'EU433',
  0x0D: 'KR920', 0x0E: 'MA869', 0x0F: 'AS923_4'
};

var SENSOR_MODEL = { 0x1F: 'thermostat1' };

/* feature id -> { n: name, k: kind, m: enum map } */
var FEATURES = {
  0x01: { n: 'roomtemp', k: 'temp', ro: true },
  0x02: { n: 'setcooltemp', k: 'temp' },
  0x03: { n: 'setheattemp', k: 'temp' },
  /* enum maps are 1-based: verified from the v1.2 firmware's own AT response strings
     (+mode:cool/heat/auto/aux, +startmode:slow/fast, +fanmode:on/auto,
      +childlock:lock/unlock, +power:on/off, +controlmode:manual/auto) */
  0x04: { n: 'output_mode', k: 'enum', m: { 1: 'cool', 2: 'heat', 3: 'auto', 4: 'aux' } },
  0x05: { n: 'start_mode', k: 'enum', m: { 1: 'slow', 2: 'fast' } },
  0x06: { n: 'fan_mode', k: 'enum', m: { 1: 'on', 2: 'auto' } },
  0x07: { n: 'caltemp', k: 'cal' },
  0x08: { n: 'secondary_startup', k: 'int' },
  0x09: { n: 'compressor_delay', k: 'int', unit: 'min' },
  0x0A: { n: 'system_mode', k: 'enum', m: { 0: 'cool_only', 1: 'heat_only', 2: '1C1H', 3: '1C2H', 4: '2C2H' } },
  0x0B: { n: 'child_lock', k: 'enum', m: { 1: 'lock', 2: 'unlock' } },
  0x0C: { n: 'power', k: 'enum', m: { 1: 'on', 2: 'off' } },
  0x0D: { n: 'control_mode', k: 'enum', m: { 1: 'manual', 2: 'auto' } },
  /* 0x0E-0x2D schedule. Feature ids 0x01-0x2D (1..45) are verified against the v1.2
     firmware's own AT command list: roomtemp, setcooltemp, setheattemp, mode, startmode,
     fanmode, caltemp, secstartup, pressdelay, stmmode, childlock, power, controlmode,
     coolpro1-8temp, heatpro1-8temp, coolpro1-8time, heatpro1-8time (= 45 entries).
     'wiki' keeps the (different, unverified) naming used by the wiki table. */
  0x0E: { n: 'coolpro1temp', k: 'temp', wiki: 'weekday_period1_temp' },
  0x0F: { n: 'coolpro2temp', k: 'temp', wiki: 'weekday_period2_temp' },
  0x10: { n: 'coolpro3temp', k: 'temp', wiki: 'weekday_period3_temp' },
  0x11: { n: 'coolpro4temp', k: 'temp', wiki: 'weekday_period4_temp' },
  0x12: { n: 'coolpro5temp', k: 'temp', wiki: 'weekend_period1_temp' },
  0x13: { n: 'coolpro6temp', k: 'temp', wiki: 'weekend_period2_temp' },
  0x14: { n: 'coolpro7temp', k: 'temp', wiki: 'weekend_period3_temp' },
  0x15: { n: 'coolpro8temp', k: 'temp', wiki: 'weekend_period4_temp' },
  0x16: { n: 'heatpro1temp', k: 'temp', wiki: 'holiday_period1_temp' },
  0x17: { n: 'heatpro2temp', k: 'temp', wiki: 'holiday_period2_temp' },
  0x18: { n: 'heatpro3temp', k: 'temp', wiki: 'holiday_period3_temp' },
  0x19: { n: 'heatpro4temp', k: 'temp', wiki: 'holiday_period4_temp' },
  0x1A: { n: 'heatpro5temp', k: 'temp' },
  0x1B: { n: 'heatpro6temp', k: 'temp' },
  0x1C: { n: 'heatpro7temp', k: 'temp' },
  0x1D: { n: 'heatpro8temp', k: 'temp' },
  0x1E: { n: 'coolpro1time', k: 'sched_time', wiki: 'weekend_period1_time' },
  0x1F: { n: 'coolpro2time', k: 'sched_time', wiki: 'weekend_period2_time' },
  0x20: { n: 'coolpro3time', k: 'sched_time', wiki: 'weekend_period3_time' },
  0x21: { n: 'coolpro4time', k: 'sched_time', wiki: 'weekend_period4_time' },
  0x22: { n: 'coolpro5time', k: 'sched_time', wiki: 'holiday_period1_time' },
  0x23: { n: 'coolpro6time', k: 'sched_time', wiki: 'holiday_period2_time' },
  0x24: { n: 'coolpro7time', k: 'sched_time', wiki: 'holiday_period3_time' },
  0x25: { n: 'coolpro8time', k: 'sched_time', wiki: 'holiday_period4_time' },
  0x26: { n: 'heatpro1time', k: 'sched_time' },
  0x27: { n: 'heatpro2time', k: 'sched_time' },
  0x28: { n: 'heatpro3time', k: 'sched_time' },
  0x29: { n: 'heatpro4time', k: 'sched_time' },
  0x2A: { n: 'heatpro5time', k: 'sched_time' },
  0x2B: { n: 'heatpro6time', k: 'sched_time' },
  0x2C: { n: 'heatpro7time', k: 'sched_time' },
  0x2D: { n: 'heatpro8time', k: 'sched_time' },
};

/* old v1.0 names, kept only to help customers migrate their templates */
var V10_NAMES = {
  0x0E: 'coolpro1temp', 0x0F: 'coolpro2temp', 0x10: 'coolpro3temp', 0x11: 'coolpro4temp',
  0x12: 'coolpro5temp', 0x13: 'coolpro6temp', 0x14: 'coolpro7temp', 0x15: 'coolpro8temp',
  0x16: 'heatpro1temp', 0x17: 'heatpro2temp', 0x18: 'heatpro3temp', 0x19: 'heatpro4temp',
  0x1A: 'heatpro5temp', 0x1B: 'heatpro6temp', 0x1C: 'heatpro7temp', 0x1D: 'heatpro8temp',
  0x1E: 'coolpro1time', 0x1F: 'coolpro2time', 0x20: 'coolpro3time', 0x21: 'coolpro4time',
  0x22: 'coolpro5time', 0x23: 'coolpro6time', 0x24: 'coolpro7time', 0x25: 'coolpro8time'
};

function hex2(v) {
  var s = (v === undefined || v === null) ? '--' : v.toString(16).toUpperCase();
  return s.length < 2 ? '0' + s : s;
}

function s16(hi, lo) {
  var v = ((hi & 0xFF) << 8) | (lo & 0xFF);
  return (v & 0x8000) ? v - 0x10000 : v;
}

function f2c(f) {
  return Math.round((((f - 32) * 5 / 9)) * 10) / 10;
}

function hhmm(min) {
  if (min < 0 || min > 1439) return null;
  var h = Math.floor(min / 60), m = min % 60;
  return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
}

function sensorType(code) {
  /* VERIFIED against the wiki's own TTN screenshots (2026-10-14):
       01 03 26 01 -> JSON sensor:"external"      (byte 3 = 01)
       01 03 15 01 ... -> JSON sensor:"external"
     and the datalog prose "01 (external probe)".
     The wiki 2.3.2 text table ("01H: internal / 00H: external") contradicts
     its own examples and the shipped v1.0 decoder; examples win. */
  if (code === 0x01) return 'external';
  if (code === 0x00) return 'internal';
  return 'unknown(0x' + hex2(code) + ')';
}

/* decode a 2-byte feature value according to its kind */
function decodeFeature(id, hi, lo, out) {
  var f = FEATURES[id];
  var raw = s16(hi, lo);
  if (!f) {
    out.feature_value_raw = raw;
    return null;
  }
  var v;
  if (f.k === 'temp') {
    v = raw / 10;                      /* degF x10 on the wire (0x0064 = 10.0 degF) */
    out[f.n + '_F'] = Math.round(v * 10) / 10;
    out[f.n + '_C'] = f2c(v);
  } else if (f.k === 'cal') {
    v = raw - 5;                       /* wiki: raw 0 = -5 degF, raw 10 = +5 degF */
    out.caltemp_F = v;
    out.caltemp_raw = raw;
  } else if (f.k === 'sched_time') {
    /* the two encodings disagree between the official decoder (two bytes HH:MM)
       and the wiki table (integer minutes 0-1439); v1.2 firmware did not settle it,
       so both are emitted and both derive from the same 16-bit value */
    out[f.n + '_raw'] = raw;
    out[f.n + '_hex'] = hex2(hi) + hex2(lo);
    out[f.n + '_hhmm_bytes'] = hex2(hi) + ':' + hex2(lo);
    out[f.n + '_minutes'] = raw;
    out[f.n + '_hhmm_from_minutes'] = hhmm(raw);
    v = raw;
  } else if (f.k === 'enum') {
    v = (f.m && f.m[raw] !== undefined) ? f.m[raw] : 'raw(' + raw + ')';
    out[f.n] = v;
    out[f.n + '_raw'] = raw;
  } else {
    v = raw;
    out[f.n] = f.unit ? (raw + ' ' + f.unit) : raw;
  }
  return v;
}

/* ----------------------------- fPort 2 ----------------------------- */

function decodePort2(bytes, warnings) {
  var out = {};
  var t = bytes[0];

  if (t === 0x01) {
    out.type = 'uplink';
    if (bytes.length < 4) {
      warnings.push('fPort2/type1: payload shorter than 4 bytes, cannot decode');
      out.payload_hex = '';
      return out;
    }
    var rf = s16(bytes[1], bytes[2]) / 10;
    out.roomtemp_F = Math.round(rf * 10) / 10;
    out.roomtemp_C = f2c(rf);
    out.sensor = sensorType(bytes[3]);
    out.sensor_raw = bytes[3];
    out.setpoint_present = bytes.length >= 8;
    if (bytes.length >= 8) {
      var cf = s16(bytes[4], bytes[5]) / 10;
      var hf = s16(bytes[6], bytes[7]) / 10;
      out.setcooltemp_F = Math.round(cf * 10) / 10;
      out.setcooltemp_C = f2c(cf);
      out.setheattemp_F = Math.round(hf * 10) / 10;
      out.setheattemp_C = f2c(hf);
      /* documented valid range for both setpoints is 43-95 F; the vendor's own example frame
         carries uninitialised values (819.2 F / 304.8 F), so flag it instead of looking broken */
      out.setpoint_in_range = (cf >= 43 && cf <= 95 && hf >= 43 && hf <= 95);
      if (!out.setpoint_in_range) {
        warnings.push('setpoint value(s) outside the documented 43-95 F range - the field layout is ' +
          'still correct, but this unit may never have had its setpoints configured');
      }
    } else if (!QUIET_4BYTE_WARNING) {
      warnings.push('automatic uplink carries room temperature only (4 bytes): ' +
        'setpoint / mode / relay state are NOT in this frame. ' +
        'Poll with downlink 0x02 <feature> 01, or ask Dragino for the extended periodic payload.');
    }
    if (bytes.length > 8) {
      out.trailing_hex = bytes.slice(8).map(hex2).join(' ');
    }
    return out;
  }

  if (t === 0x02) {
    var feat = bytes[1];
    var flag = bytes[2];
    var meta = FEATURES[feat];
    out.feature_hex = '0x' + hex2(feat);
    out.feature = meta ? meta.n : 'unknown';
    if (V10_NAMES[feat] && V10_NAMES[feat] !== out.feature) out.feature_name_v10 = V10_NAMES[feat];

    if (flag === 0x01) {
      out.type = 'downlink_get';
      if (bytes.length < 7) {
        warnings.push('fPort2/type2: get reply shorter than 7 bytes');
      } else {
        out.echo_hex = hex2(bytes[3]) + ' ' + hex2(bytes[4]);
        decodeFeature(feat, bytes[5], bytes[6], out);
        out.value_hex = hex2(bytes[5]) + ' ' + hex2(bytes[6]);
      }
    } else if (flag === 0x02) {
      out.type = 'downlink_set';
      if (bytes.length === 6 && bytes[5] === 0x01) {
        /* v1.2 Celsius form: the two value bytes are a Celsius value; the device converts
           it to Fahrenheit internally (changelog example: 02 02 02 00 64 01 = 10 C = 50 F) */
        var cv = s16(bytes[3], bytes[4]) / 10;
        out.set_value_hex = hex2(bytes[3]) + ' ' + hex2(bytes[4]);
        out.unit_hint = 'celsius (firmware v1.2+)';
        out.set_value_celsius = Math.round(cv * 10) / 10;
        out.set_value_F = Math.round((cv * 9 / 5 + 32) * 10) / 10;
        warnings.push('fPort2/type2: 6-byte set command with trailing 0x01 (v1.2 Celsius form) - ' +
          'value interpreted as Celsius, converted to Fahrenheit: ' + out.set_value_celsius + ' C = ' + out.set_value_F + ' F');
      } else if (bytes.length < 7) {
        warnings.push('fPort2/type2: set reply shorter than 7 bytes');
      } else {
        out.set_value_hex = hex2(bytes[3]) + ' ' + hex2(bytes[4]);
        decodeFeature(feat, bytes[3], bytes[4], out);
        var r = s16(bytes[5], bytes[6]);
        out.set_result = (r === 0x01) ? 'ok'
          : (r === 0x02) ? 'illegal range'
            : (r === 0x03) ? 'unknown value'
              : (r === 0xFFFF) ? 'other' : 'code(' + r + ')';
        out.set_result_raw = r;
      }
    } else {
      out.type = 'downlink_reply';
      warnings.push('fPort2/type2: unexpected flag byte 0x' + hex2(flag) +
        ' (wiki table calls this byte "sensor type", decoder v1.1 expects 01=get / 02=set; please verify with real traffic)');
      if (bytes.length >= 7) decodeFeature(feat, bytes[5], bytes[6], out);
    }
    return out;
  }

  if (t === 0x03) {
    out.type = 'internal_function_uplink';
    out.items = [];
    var i = 1;
    while (i + 2 <= bytes.length) {
      var id = bytes[i];
      var m = FEATURES[id];
      var item = { feature_hex: '0x' + hex2(id), feature: m ? m.n : 'unknown' };
      var tmp = {};
      decodeFeature(id, bytes[i + 1], bytes[i + 2], tmp);
      for (var k in tmp) if (Object.prototype.hasOwnProperty.call(tmp, k)) item[k] = tmp[k];
      out.items.push(item);
      /* also expose the first occurrence of every decoded key as a flat field,
         so existing template mappings keep working */
      for (var k2 in item) {
        if (!Object.prototype.hasOwnProperty.call(item, k2)) continue;
        if (k2 === 'feature' || k2 === 'feature_hex') continue;
        if (out[k2] === undefined) out[k2] = item[k2];
      }
      i += 3;
    }
    if ((bytes.length - 1) % 3 !== 0) warnings.push('fPort2/type3: payload length is not 1 + 3*n');
    return out;
  }

  out.type = 'unknown_type';
  out.type_hex = '0x' + hex2(t);
  warnings.push('fPort2: unknown uplink type 0x' + hex2(t));
  return out;
}

/* ----------------------------- fPort 3 (datalog) ----------------------------- */

function decodePort3(bytes, warnings) {
  var out = { type: 'datalog', entries: [] };
  /* VERIFIED layout (wiki 2.5.4 TTN screenshot, 2026-10-14):
       00 00 00 00 | 01 | 03 1E | 68 D5 F5 61
       = 4 bytes (always 0 in the sample) + sensor(1) + temp x10 degF(2) + unix time, big endian(4)
       -> 11 bytes per entry.  The wiki TEXT says "8 bytes per entry" and its example
          payload shows 8-byte entries with the timestamp first - both contradict the
          screenshot, so the 8-byte form is kept only as a fallback. */
  var REC = 11;
  /* do not trust the length alone: the old (pre-v1.2) datalog format could also be a
     multiple of 11. Accept the 11-byte layout only if every record looks like one. */
  var looks11 = (bytes.length % REC === 0);
  if (looks11) {
    for (var q = 0; q + REC - 1 < bytes.length; q += REC) {
      var tsq = ((bytes[q + 7] << 24) | (bytes[q + 8] << 16) | (bytes[q + 9] << 8) | bytes[q + 10]) >>> 0;
      if (!(tsq > 1600000000 && tsq < 2200000000) || bytes[q + 4] > 0x01) { looks11 = false; break; }
    }
  }
  if (looks11) {
    for (var i = 0; i + REC - 1 < bytes.length; i += REC) {
      var d = bytes.slice(i, i + REC);
      var ts = ((d[7] << 24) | (d[8] << 16) | (d[9] << 8) | d[10]) >>> 0;
      var tf = s16(d[5], d[6]) / 10;
      out.entries.push({
        layout: '11-byte (screenshot verified)',
        raw_hex: d.map(hex2).join(' '),
        sensor: sensorType(d[4]),
        sensor_raw: d[4],
        roomtemp_F: Math.round(tf * 10) / 10,
        roomtemp_C: f2c(tf),
        timestamp: ts,
        time_utc: (ts > 1600000000 && ts < 2200000000)
          ? new Date(ts * 1000).toISOString().replace('.000Z', 'Z') : null
      });
    }
    return out;
  }
  if (bytes.length % 8 !== 0) warnings.push('fPort3: length is not a multiple of 11 (verified) or 8 (legacy)');
  for (var j = 0; j + 7 < bytes.length; j += 8) {
    var e = { layout: '8-byte legacy', raw_hex: bytes.slice(j, j + 8).map(hex2).join(' ') };
    var tsA = ((bytes[j] << 24) | (bytes[j + 1] << 16) | (bytes[j + 2] << 8) | bytes[j + 3]) >>> 0;
    var tsB = ((bytes[j + 4] << 24) | (bytes[j + 5] << 16) | (bytes[j + 6] << 8) | bytes[j + 7]) >>> 0;
    if (tsA > 1600000000 && tsA < 2200000000) { e.timestamp = tsA; e.data_hex = bytes.slice(j + 4, j + 8).map(hex2).join(' '); }
    else if (tsB > 1600000000 && tsB < 2200000000) { e.timestamp = tsB; e.data_hex = bytes.slice(j, j + 4).map(hex2).join(' '); }
    else { e.timestamp = tsA; e.data_hex = bytes.slice(j + 4, j + 8).map(hex2).join(' '); warnings.push('fPort3: no plausible unix timestamp in entry ' + (j / 8)); }
    e.time_utc = new Date(e.timestamp * 1000).toISOString().replace('.000Z', 'Z');
    /* best-effort interpretation of the 4 data bytes: [x][sensor][temp hi lo] */
    var dd = bytes.slice(e.data_hex.split(' ').length === 4 && e.data_hex === bytes.slice(j, j + 4).map(hex2).join(' ') ? j : j + 4, undefined);
    var dv = bytes.slice((e.data_hex === bytes.slice(j, j + 4).map(hex2).join(' ')) ? j : j + 4, ((e.data_hex === bytes.slice(j, j + 4).map(hex2).join(' ')) ? j : j + 4) + 4);
    if ((dv[1] === 0x00 || dv[1] === 0x01)) {
      var c2 = s16(dv[2], dv[3]);
      if (c2 >= 300 && c2 <= 1250) {
        e.sensor = sensorType(dv[1]);
        e.roomtemp_F = c2 / 10;
        e.roomtemp_C = f2c(c2 / 10);
      }
    }
    out.entries.push(e);
  }
  warnings.push('fPort3: fell back to the legacy 8-byte entry layout (wiki text); verify against your device');
  return out;
}

/* ----------------------------- fPort 5 (device status) ----------------------------- */

function decodePort5(bytes, warnings) {
  var out = { type: 'device_status' };
  out.sensor_model = SENSOR_MODEL[bytes[0]] || ('unknown(0x' + hex2(bytes[0]) + ')');
  if (bytes.length < 5) { warnings.push('fPort5: status payload shorter than 5 bytes'); return out; }
  out.firmware_version = (bytes[1] & 0x0F) + '.' + ((bytes[2] >> 4) & 0x0F) + '.' + (bytes[2] & 0x0F);
  out.frequency_band = FREQ_BAND[bytes[3]] || ('unknown(0x' + hex2(bytes[3]) + ')');
  out.sub_band = (bytes[4] === 0xFF) ? 'NULL' : bytes[4];
  if (bytes.length > 5) out.extra_hex = bytes.slice(5).map(hex2).join(' ');
  return out;
}

/* ----------------------------- entry points ----------------------------- */

function Decoder(bytes, port) {
  var warnings = [];
  var data = {};
  if (!bytes || bytes.length === 0) {
    warnings.push('empty payload');
  } else if (port === 2) {
    data = decodePort2(bytes, warnings);
  } else if (port === 3) {
    data = decodePort3(bytes, warnings);
  } else if (port === 5) {
    data = decodePort5(bytes, warnings);
  } else {
    data = { type: 'unsupported_port' };
    warnings.push('no decoder for fPort ' + port);
  }
  data.fport = port;
  data.payload_len = bytes ? bytes.length : 0;
  return { data: data, warnings: warnings };
}

/* TTN v3 / ChirpStack v4 signature */
function decodeUplink(input) {
  var r = Decoder(input.bytes, input.fPort);
  return { data: r.data, warnings: r.warnings, errors: [] };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { Decoder: Decoder, decodeUplink: decodeUplink };
}

