import React, { useContext, useEffect, useState } from 'react';
import { AppContext } from '../App.jsx';
import { camera } from '../api.js';
import {
  Activity, Aperture, Camera, ChevronDown, ChevronUp, Focus, Gauge, Palette,
  RefreshCw, Ruler, Sun, Timer, Trash2,
} from 'lucide-react';
import {
  PTP_PROP,
  EXPOSURE_PROGRAM_CODES,
  WHITE_BALANCE_CODES,
  METERING_CODES,
  FOCUS_MODE_CODES,
  DRIVE_MODE_CODES,
  shutterLabelToMicros,
  apertureLabelToHundredths,
  exposureCompensationToMilliEv,
  exposureProgramLabel,
  exposureTimeMicrosToLabel,
  fNumberLabel,
} from '../nikonProperties.js';

const ISO_VALUES = [100,125,160,200,250,320,400,500,640,800,1000,1250,1600,2000,2500,3200,4000,5000,6400,8000,10000,12800,16000,20000,25600,32000,40000,51200];
const SHUTTER_LABELS = ['30"','25"','20"','15"','13"','10"','8"','6"','5"','4"','3.2"','2.5"','2"','1.6"','1.3"','1"','1/1.3','1/1.6','1/2','1/2.5','1/3','1/4','1/5','1/6','1/8','1/10','1/13','1/15','1/20','1/25','1/30','1/40','1/50','1/60','1/80','1/100','1/125','1/160','1/200','1/250','1/320','1/400','1/500','1/640','1/800','1/1000','1/1250','1/1600','1/2000','1/2500','1/3200','1/4000','1/8000','1/10000','1/12500','1/16000','1/20000','1/25000','1/32000'];
const APERTURE_LABELS = ['F1.4','F1.6','F1.8','F2','F2.2','F2.5','F2.8','F3.2','F3.5','F4','F4.5','F5','F5.6','F6.3','F7.1','F8','F9','F10','F11','F13','F14','F16','F18','F20','F22'];
const EXP_COMP_VALUES = [-5,-4.666,-4.333,-4,-3.666,-3.333,-3,-2.666,-2.333,-2,-1.666,-1.333,-1,-0.666,-0.333,0,0.333,0.666,1,1.333,1.666,2,2.333,2.666,3,3.333,3.666,4,4.333,4.666,5];
const EXPOSURE_MODE_OPTIONS = ['M','A','S','P','AUTO','U1','U2','U3'];

function nearestIndex(values, target) {
  let best = -1;
  let distance = Infinity;
  values.forEach((value, index) => {
    const next = Math.abs(Number(value) - Number(target));
    if (Number.isFinite(next) && next < distance) {
      distance = next;
      best = index;
    }
  });
  return best;
}

function enumKey(table, raw) {
  const value = Number(raw);
  return Object.keys(table).find(key => table[key] === value) || null;
}

const RESPONSE_HINTS = {
  0x2001: '成功',
  0x2005: '相机拒绝或不支持',
  0x200F: '相机当前状态不允许写入',
  0x2019: '相机正忙',
  0x201E: '会话已打开',
  0x201F: '相机未接受参数',
};

function formatPropValue(propCode, value) {
  if (value == null) return '--';
  const code = Number(propCode);
  if (code === PTP_PROP.ExposureTime) return exposureTimeMicrosToLabel(value);
  if (code === PTP_PROP.FNumber) return fNumberLabel(value);
  if (code === PTP_PROP.ExposureProgramMode) return exposureProgramLabel(value);
  if (code === PTP_PROP.ExposureIndex) return Number(value) === 0xFFFFFFFF ? 'AUTO' : String(value);
  if (code === PTP_PROP.ExposureBiasCompensation) {
    const stops = Number(value) / 1000;
    return `${stops >= 0 ? '+' : ''}${stops.toFixed(1)} EV`;
  }
  if (code === PTP_PROP.WhiteBalance) return enumKey(WHITE_BALANCE_CODES, value) || String(value);
  if (code === PTP_PROP.FocusMode) return enumKey(FOCUS_MODE_CODES, value) || String(value);
  if (code === PTP_PROP.ExposureMeteringMode) return enumKey(METERING_CODES, value) || String(value);
  if (code === PTP_PROP.StillCaptureMode) return enumKey(DRIVE_MODE_CODES, value) || String(value);
  return String(value);
}

function diagnosticResult(item) {
  if (item.operation === 'read') {
    if (item.responseCode === 0x2001) return `读取成功 · ${formatPropValue(item.propCode, item.value)}`;
    if (item.error) return `读取超时 · ${item.error}`;
    return `读取失败 · ${RESPONSE_HINTS[item.responseCode] || item.responseHex}`;
  }
  if (item.responseCode !== 0x2001) {
    if (item.error) return `写入超时 · ${item.error}`;
    return `写入失败 · ${RESPONSE_HINTS[item.responseCode] || item.responseHex}`;
  }
  if (item.readbackError) return `写入成功 · 读回超时（${item.readbackError}）`;
  if (item.readbackCode !== 0x2001) {
    return `写入成功 · 读回失败（${RESPONSE_HINTS[item.readbackCode] || item.readbackRawHex || '--'}）`;
  }
  const target = formatPropValue(item.propCode, item.requestedValue);
  const actual = formatPropValue(item.propCode, item.readbackValue);
  return item.matches ? `写入并读回一致 · ${actual}` : `写入成功但未生效 · ${target} → ${actual}`;
}

function StepControl({ label, value, values, format = v => v, onChange, disabled = false, icon: Icon, accent = 'var(--accent)' }) {
  const index = values ? values.indexOf(value) : -1;
  const canDown = values && index > 0;
  const canUp = values && index >= 0 && index < values.length - 1;
  const nudge = direction => {
    if (!values || index < 0) return;
    const next = index + direction;
    if (next >= 0 && next < values.length) onChange(values[next]);
  };

  return (
    <div className={`panel-raised flex-1 min-w-0 p-3 ${disabled ? 'opacity-35' : ''}`}>
      <div className="flex items-center gap-2 text-[10px] text-[var(--text-muted)] mb-2">
        {Icon && <Icon size={13} />}
        <span>{label}</span>
      </div>
      <p className="mono text-[18px] leading-none font-semibold truncate" style={{ color: value === '--' ? 'var(--text-muted)' : accent }}>{format(value)}</p>
      <div className="grid grid-cols-2 gap-1.5 mt-3">
        <button type="button" className="btn btn-secondary h-7 min-h-0 px-0" disabled={disabled || !canDown} onClick={() => nudge(-1)}>−</button>
        <button type="button" className="btn btn-secondary h-7 min-h-0 px-0" disabled={disabled || !canUp} onClick={() => nudge(1)}>+</button>
      </div>
    </div>
  );
}

export default function CameraControlPanel({ compact = false, onStateChange }) {
  const { state } = useContext(AppContext);
  const [expMode, setExpMode] = useState(null);
  const [iso, setIso] = useState(null);
  const [shutterI, setShutterI] = useState(null);
  const [apertureI, setApertureI] = useState(null);
  const [wb, setWb] = useState(null);
  const [focus, setFocus] = useState(null);
  const [expCompI, setExpCompI] = useState(null);
  const [metering, setMetering] = useState(null);
  const [drive, setDrive] = useState(null);
  const [propError, setPropError] = useState('');
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [propertyDiagnostics, setPropertyDiagnostics] = useState(() => camera.getPropertyDiagnostics?.() || []);

  const shutLabel = shutterI == null ? '--' : (SHUTTER_LABELS[shutterI] || '--');
  const apLabel = apertureI == null ? '--' : (APERTURE_LABELS[apertureI] || '--');
  const ecValue = expCompI == null ? null : EXP_COMP_VALUES[expCompI];
  const ecLabel = ecValue == null ? '--' : `${ecValue >= 0 ? '+' : ''}${ecValue.toFixed(1)}`;

  useEffect(() => {
    if (!onStateChange) return;
    onStateChange({ expMode: expMode || '--', iso: iso ?? '--', shutter: shutLabel, aperture: apLabel, ev: ecValue ?? 0 });
  }, [onStateChange, expMode, iso, shutLabel, apLabel, ecValue]);

  useEffect(() => {
    const unsubscribe = camera.onPropertyDiagnostic?.(item => {
      setPropertyDiagnostics(previous => [item, ...previous].slice(0, 50));
    });
    return () => {
      try { if (typeof unsubscribe === 'function') unsubscribe(); } catch {}
    };
  }, []);

  useEffect(() => {
    if (state.connectionState !== 'session_open') return undefined;
    let cancelled = false;
    let timer = null;

    const read = async (code) => {
      try {
        const result = await camera.getProp(code);
        return result?.code === 0x2001 ? result.value : null;
      } catch {
        return null;
      }
    };

    const sync = async () => {
      const [modeRaw, isoRaw, shutterRaw, apertureRaw, wbRaw, focusRaw, evRaw, meteringRaw, driveRaw] = await Promise.all([
        read(PTP_PROP.ExposureProgramMode), read(PTP_PROP.ExposureIndex), read(PTP_PROP.ExposureTime),
        read(PTP_PROP.FNumber), read(PTP_PROP.WhiteBalance), read(PTP_PROP.FocusMode),
        read(PTP_PROP.ExposureBiasCompensation), read(PTP_PROP.ExposureMeteringMode), read(PTP_PROP.StillCaptureMode),
      ]);
      if (cancelled) return;
      if (modeRaw != null) setExpMode(exposureProgramLabel(modeRaw));
      if (isoRaw != null) setIso(Number(isoRaw) === 0xFFFFFFFF ? 'AUTO' : Number(isoRaw));
      if (shutterRaw != null) {
        const label = exposureTimeMicrosToLabel(shutterRaw);
        const index = SHUTTER_LABELS.indexOf(label);
        if (index >= 0) setShutterI(index);
      }
      if (apertureRaw != null) {
        const label = fNumberLabel(apertureRaw);
        const index = APERTURE_LABELS.indexOf(label);
        if (index >= 0) setApertureI(index);
      }
      if (wbRaw != null) setWb(previous => enumKey(WHITE_BALANCE_CODES, wbRaw) || previous);
      if (focusRaw != null) setFocus(previous => enumKey(FOCUS_MODE_CODES, focusRaw) || previous);
      if (evRaw != null) {
        const index = nearestIndex(EXP_COMP_VALUES, Number(evRaw) / 1000);
        if (index >= 0) setExpCompI(index);
      }
      if (meteringRaw != null) setMetering(previous => enumKey(METERING_CODES, meteringRaw) || previous);
      if (driveRaw != null) setDrive(previous => enumKey(DRIVE_MODE_CODES, driveRaw) || previous);
      console.log('[相机参数]', JSON.stringify({ modeRaw, isoRaw, shutterRaw, apertureRaw, evRaw, wbRaw, focusRaw, meteringRaw, driveRaw }));
      timer = setTimeout(sync, 3000);
    };
    sync();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [state.connectionState]);

  const setProp = async (code, value, label) => {
    setPropError('');
    try {
      const result = await camera.setProp(code, value);
      if (!result?.success) {
        const codeText = result?.code != null ? `PTP 0x${Number(result.code).toString(16)}` : '无响应';
        setPropError(`${label}写入失败（${codeText}）`);
        return false;
      }
      if (result.verified === false) {
        const target = formatPropValue(code, value);
        const actual = result.readbackValue == null ? '未读到值' : formatPropValue(code, result.readbackValue);
        setPropError(`${label}已发送，但相机未确认生效（目标 ${target}，读回 ${actual}）`);
      }
      return true;
    } catch (e) {
      setPropError(`${label}写入失败：${e.message || e}`);
      return false;
    }
  };

  return (
    <div className={compact ? 'p-3 space-y-3' : 'page-inner space-y-3'}>
      <section className="panel">
        <div className="px-3 py-2.5 border-b border-[var(--line)] flex items-center justify-between">
          <div className="flex items-center gap-2"><Gauge size={15} /><span className="section-title">曝光模式</span></div>
          <span className="badge badge-yellow">{expMode || '读取中'}</span>
        </div>
        <div className="p-3 grid grid-cols-4 gap-1.5">
          {EXPOSURE_MODE_OPTIONS.map(mode => (
            <button
              key={mode}
              type="button"
              className={`grid-chip mono ${expMode === mode ? 'active' : ''}`}
              onClick={async () => { if (expMode !== mode && await setProp(PTP_PROP.ExposureProgramMode, EXPOSURE_PROGRAM_CODES[mode], '曝光模式')) setExpMode(mode); }}
            >
              {mode}
            </button>
          ))}
        </div>
      </section>

      <div className="flex gap-2">
        <StepControl label="ISO" value={iso ?? '--'} values={ISO_VALUES} onChange={async value => { if (await setProp(PTP_PROP.ExposureIndex, value, 'ISO')) setIso(value); }} disabled={expMode === 'AUTO'} icon={Sun} />
        <StepControl label="快门" value={shutLabel} values={SHUTTER_LABELS} onChange={async value => { if (await setProp(PTP_PROP.ExposureTime, shutterLabelToMicros(value), '快门')) setShutterI(SHUTTER_LABELS.indexOf(value)); }} disabled={expMode === 'A' || expMode === 'P'} icon={Timer} />
        <StepControl label="光圈" value={apLabel} values={APERTURE_LABELS} onChange={async value => { if (await setProp(PTP_PROP.FNumber, apertureLabelToHundredths(value), '光圈')) setApertureI(APERTURE_LABELS.indexOf(value)); }} disabled={expMode === 'S' || expMode === 'P'} icon={Aperture} />
      </div>

      <section className="panel px-3 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[11px]"><Sun size={15} className="text-[var(--warning)]" /> 曝光补偿</div>
        <div className="flex items-center gap-3">
          <button className="btn btn-secondary h-8 min-h-0 px-3" disabled={expCompI == null || expCompI <= 0} onClick={async () => { const i = Math.max(0, expCompI - 1); if (await setProp(PTP_PROP.ExposureBiasCompensation, exposureCompensationToMilliEv(EXP_COMP_VALUES[i]), '曝光补偿')) setExpCompI(i); }}>−</button>
          <span className="mono text-lg font-semibold text-[var(--warning)] min-w-[64px] text-center">{ecLabel} EV</span>
          <button className="btn btn-secondary h-8 min-h-0 px-3" disabled={expCompI == null || expCompI >= EXP_COMP_VALUES.length - 1} onClick={async () => { const i = Math.min(EXP_COMP_VALUES.length - 1, expCompI + 1); if (await setProp(PTP_PROP.ExposureBiasCompensation, exposureCompensationToMilliEv(EXP_COMP_VALUES[i]), '曝光补偿')) setExpCompI(i); }}>+</button>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-2">
        <section className="panel p-3">
          <div className="flex items-center gap-2 text-[10px] text-[var(--text-muted)] mb-2"><Palette size={13} /> 白平衡</div>
          <select className="select" value={wb || ''} onChange={async event => { if (await setProp(PTP_PROP.WhiteBalance, WHITE_BALANCE_CODES[event.target.value], '白平衡')) setWb(event.target.value); }}>
            {!wb && <option value="" disabled>读取中</option>}
            <option value="AUTO">自动</option><option value="AUTO_NATURAL">自然光自动</option><option value="INCANDESCENT">白炽灯</option><option value="FLUORESCENT">荧光灯</option><option value="DIRECT_SUNLIGHT">晴天</option><option value="FLASH">闪光灯</option><option value="CLOUDY">阴天</option><option value="SHADE">阴影</option><option value="COLOR_TEMP">色温</option>
          </select>
        </section>
        <section className="panel p-3">
          <div className="flex items-center gap-2 text-[10px] text-[var(--text-muted)] mb-2"><Ruler size={13} /> 测光</div>
          <select className="select" value={metering || ''} onChange={async event => { if (await setProp(PTP_PROP.ExposureMeteringMode, METERING_CODES[event.target.value], '测光模式')) setMetering(event.target.value); }}>
            {!metering && <option value="" disabled>读取中</option>}
            <option value="MATRIX">矩阵测光</option><option value="CENTER_WEIGHTED">中央重点</option><option value="SPOT">点测光</option><option value="HIGHLIGHT_WEIGHTED">高光加权</option>
          </select>
        </section>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <section className="panel p-3">
          <div className="flex items-center gap-2 text-[10px] text-[var(--text-muted)] mb-2"><Focus size={13} /> 对焦模式</div>
          <div className="grid grid-cols-3 gap-1.5">
            {['AF-S','AF-C','MF'].map(mode => (
              <button key={mode} className={`grid-chip ${focus === mode ? 'active' : ''}`} onClick={async () => { if (await setProp(PTP_PROP.FocusMode, FOCUS_MODE_CODES[mode], '对焦模式')) setFocus(mode); }}>{mode}</button>
            ))}
          </div>
          <button className="btn btn-secondary w-full mt-2" onClick={async () => { try { await camera.autoFocus(); setPropError(''); } catch (e) { setPropError(`自动对焦失败：${e.message || e}`); } }}><Focus size={14} /> 触发自动对焦</button>
        </section>
        <section className="panel p-3">
          <div className="flex items-center gap-2 text-[10px] text-[var(--text-muted)] mb-2"><Camera size={13} /> 驱动模式</div>
          <select className="select" value={drive || ''} onChange={async event => { if (await setProp(PTP_PROP.StillCaptureMode, DRIVE_MODE_CODES[event.target.value], '驱动模式')) setDrive(event.target.value); }}>
            {!drive && <option value="" disabled>读取中</option>}
            <option value="S">单张拍摄</option><option value="CL">低速连拍</option><option value="CH">高速连拍</option><option value="Q">静音拍摄</option><option value="TIMER">自拍定时</option>
          </select>
        </section>
      </div>

      {propError && <div className="panel px-3 py-2.5 text-[10px] leading-4 text-[var(--warning)]">{propError}</div>}

      <section className="panel overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--line)]">
          <button
            type="button"
            className="flex items-center gap-2 min-w-0 flex-1 text-left"
            onClick={() => setDiagnosticsOpen(value => !value)}
          >
            <Activity size={14} className="text-[var(--blue)]" />
            <span className="text-[11px] font-semibold">参数诊断</span>
            <span className="badge badge-blue">{propertyDiagnostics.length}</span>
            {propertyDiagnostics.some(item => !item.ok) && (
              <span className="badge badge-red">{propertyDiagnostics.filter(item => !item.ok).length} 异常</span>
            )}
            <span className="ml-auto text-[var(--text-muted)]">
              {diagnosticsOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </span>
          </button>
          {propertyDiagnostics.length > 0 && (
            <button
              type="button"
              className="btn-icon w-7 h-7"
              title="清空诊断记录"
              aria-label="清空诊断记录"
              onClick={() => {
                camera.clearPropertyDiagnostics?.();
                setPropertyDiagnostics([]);
              }}
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
        {diagnosticsOpen && (
          <div className="divide-y divide-[var(--line)] max-h-72 overflow-auto">
            {propertyDiagnostics.length === 0 ? (
              <p className="px-3 py-4 text-center text-[10px] text-[var(--text-muted)]">等待参数读写记录</p>
            ) : propertyDiagnostics.map((item, index) => (
              <div key={`${item.timestamp}-${index}`} className="px-3 py-2.5">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[11px] font-semibold truncate">{item.property}</span>
                  <span className={`badge ${item.operation === 'write' ? 'badge-yellow' : 'badge-blue'}`}>
                    {item.operation === 'write' ? '写入' : '读取'}
                  </span>
                  <span className={`badge ${item.ok ? 'badge-green' : 'badge-red'}`}>
                    {item.ok ? '正常' : '异常'}
                  </span>
                  <span className="ml-auto text-[9px] text-[var(--text-muted)] mono">{item.transport}</span>
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5 text-[9px] text-[var(--text-muted)] mono">
                  <span>操作 {item.opHex}</span>
                  <span>响应 {item.responseHex}</span>
                  <span>{item.elapsedMs} ms</span>
                  <span>{item.propHex}</span>
                </div>
                <p className={`mt-1 text-[10px] leading-4 ${item.ok ? 'text-[var(--text-soft)]' : 'text-[var(--warning)]'}`}>
                  {diagnosticResult(item)}
                </p>
                {(item.rawHex || item.readbackRawHex) && (
                  <p className="mt-1 text-[9px] leading-4 text-[var(--text-muted)] mono break-all">
                    {item.rawHex && <span>{item.operation === 'write' ? '写入' : '数据'} {item.rawHex}</span>}
                    {item.rawHex && item.readbackRawHex && <span> · </span>}
                    {item.readbackRawHex && <span>读回 {item.readbackRawHex}</span>}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="flex items-center justify-center gap-2 text-[9px] text-[var(--text-muted)] py-2"><RefreshCw size={11} /> 参数每 3 秒从相机同步一次</div>
    </div>
  );
}
