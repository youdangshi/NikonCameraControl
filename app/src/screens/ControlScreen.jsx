import React, { useState, useContext } from 'react';
import { AppContext } from '../App.jsx';
import { camera } from '../api.js';

/* ═══════════════════════════════════════════
   标准 Nikon Z30 参数步进值
   ═══════════════════════════════════════════ */

const ISO_VALUES = [100,125,160,200,250,320,400,500,640,800,1000,1250,1600,2000,2500,3200,4000,5000,6400,8000,10000,12800,16000,20000,25600,32000,40000,51200];
const SHUTTER_LABELS = ['30"','25"','20"','15"','13"','10"','8"','6"','5"','4"','3.2"','2.5"','2"','1.6"','1.3"','1"','1/1.3','1/1.6','1/2','1/2.5','1/3','1/4','1/5','1/6','1/8','1/10','1/13','1/15','1/20','1/25','1/30','1/40','1/50','1/60','1/80','1/100','1/125','1/160','1/200','1/250','1/320','1/400','1/500','1/640','1/800','1/1000','1/1250','1/1600','1/2000','1/2500','1/3200','1/4000'];
const APERTURE_LABELS = ['F1.4','F1.6','F1.8','F2','F2.2','F2.5','F2.8','F3.2','F3.5','F4','F4.5','F5','F5.6','F6.3','F7.1','F8','F9','F10','F11','F13','F14','F16','F18','F20','F22'];
const WB_OPTIONS = [
  {v:'AUTO',n:'☀️ 自动'},{v:'AUTO_NATURAL',n:'🌤 自然光自动'},{v:'INCANDESCENT',n:'💡 白炽灯'},
  {v:'FLUORESCENT',n:'🔆 荧光灯'},{v:'DIRECT_SUNLIGHT',n:'☀️ 晴天'},{v:'FLASH',n:'⚡ 闪光灯'},
  {v:'CLOUDY',n:'☁️ 阴天'},{v:'SHADE',n:'🏠 阴影'},{v:'COLOR_TEMP',n:'🌡 色温'},
];
const EXP_COMP_VALUES = [-5,-4.7,-4.3,-4,-3.7,-3.3,-3,-2.7,-2.3,-2,-1.7,-1.3,-1,-0.7,-0.3,0,0.3,0.7,1,1.3,1.7,2,2.3,2.7,3,3.3,3.7,4,4.3,4.7,5];

function findIndex(arr, v) { const i = arr.indexOf(v); return i>=0 ? i : Math.floor(arr.length/2); }

function StepControl({ label, value, values, format, color='#3b82f6', onChange, disabled }) {
  const idx = values ? values.indexOf(value) : -1;
  const display = format ? format(value) : value;
  const canDown = values && idx > 0;
  const canUp = values && idx < values.length - 1;
  const nudge = (dir) => {
    if(!values) return;
    const newIdx = idx + dir;
    if(newIdx>=0 && newIdx<values.length) onChange(values[newIdx]);
  };

  return (
    <div style={{textAlign:'center',opacity:disabled?0.35:1,transition:'opacity 0.2s'}}>
      {/* 数值显示 */}
      <div style={{
        background: `radial-gradient(circle at center, rgba(30,35,50,1), rgba(15,15,25,1))`,
        border:`2px solid ${disabled?'rgba(255,255,255,0.06)':'rgba(255,255,255,0.1)'}`,
        borderRadius:16, padding:'16px 12px', marginBottom:4, minWidth:100,
      }}>
        <div style={{fontSize:22,fontWeight:700,color:disabled?'#585870':'#e4e4ec',fontFamily:'JetBrains Mono,monospace',wordBreak:'break-all'}}>
          {display}
        </div>
        <div style={{fontSize:10,color:'#9898ac',marginTop:4,fontWeight:500}}>{label}</div>
      </div>
      {/* +/- 按钮 */}
      <div style={{display:'flex',justifyContent:'center',gap:4}}>
        <button onClick={()=>nudge(-1)} disabled={disabled||!canDown}
          style={{width:34,height:34,borderRadius:10,border:'1px solid rgba(255,255,255,0.08)',background:'rgba(255,255,255,0.04)',color:disabled||!canDown?'#585870':'#e4e4ec',fontSize:18,cursor:disabled||!canDown?'not-allowed':'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}
        >−</button>
        <button onClick={()=>nudge(1)} disabled={disabled||!canUp}
          style={{width:34,height:34,borderRadius:10,border:'1px solid rgba(255,255,255,0.08)',background:'rgba(255,255,255,0.04)',color:disabled||!canUp?'#585870':'#e4e4ec',fontSize:18,cursor:disabled||!canUp?'not-allowed':'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}
        >+</button>
      </div>
    </div>
  );
}

export default function ControlScreen() {
  const { state } = useContext(AppContext);
  const [expMode, setExpMode] = useState('M');
  const [iso, setIso] = useState(400);
  const [shutterI, setShutterI] = useState(37); // index into SHUTTER_LABELS: 1/125
  const [apertureI, setApertureI] = useState(10); // index into APERTURE_LABELS: F5.6
  const [wb, setWb] = useState('AUTO');
  const [focus, setFocus] = useState('AF-S');
  const [expCompI, setExpCompI] = useState(15); // index: 0 EV
  const [metering, setMetering] = useState('MATRIX');

  const shutLabel = SHUTTER_LABELS[shutterI]||'1/125';
  const apLabel = APERTURE_LABELS[apertureI]||'F5.6';
  const ecLabel = (EXP_COMP_VALUES[expCompI]>=0?'+':'')+EXP_COMP_VALUES[expCompI]?.toFixed(1)||'0.0';

  const setProp = async (code, v) => { try { await camera.setProp(code, v); } catch {} };

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-md mx-auto p-4 space-y-3">

        {/* 模式 + 状态 */}
        <div className="glass p-4 flex items-center justify-between anim-fade">
          <div style={{display:'flex',gap:4}}>
            {['M','A','S','P'].map(m=>(
              <button key={m} style={{
                padding:'8px 16px',borderRadius:10,fontSize:13,fontWeight:700,border:'none',cursor:'pointer',
                background:expMode===m?'#3b82f6':'rgba(255,255,255,0.05)',color:expMode===m?'#fff':'#9898ac',
                boxShadow:expMode===m?'0 4px 16px rgba(59,130,246,0.3)':'none',transition:'all 0.15s',
              }} onClick={()=>setExpMode(m)}>{m}</button>
            ))}
          </div>
          <div style={{display:'flex',gap:8,alignItems:'center'}}>
            <span className="badge badge-blue text-[10px]">Z30</span>
            {state.connectionState==='session_open'?<span className="dot dot-green"/>:<span className="dot dot-gray"/>}
          </div>
        </div>

        {/* 曝光三要素 */}
        <div className="grid grid-cols-3 gap-3">
          <div className="glass p-3">
            <StepControl label="ISO" value={iso} values={ISO_VALUES} onChange={v=>{setIso(v);setProp(0x500F,v);}}
              disabled={expMode==='AUTO'} color="#f59e0b" />
          </div>
          <div className="glass p-3">
            <StepControl label="快门" value={shutLabel} values={SHUTTER_LABELS} format={v=>v}
              onChange={v=>{setShutterI(SHUTTER_LABELS.indexOf(v));setProp(0x500D,v);}} disabled={expMode==='A'||expMode==='P'} color="#ef4444" />
          </div>
          <div className="glass p-3">
            <StepControl label="光圈" value={apLabel} values={APERTURE_LABELS} format={v=>v}
              onChange={v=>{setApertureI(APERTURE_LABELS.indexOf(v));setProp(0x5007,v);}} disabled={expMode==='S'||expMode==='P'} color="#22c55e" />
          </div>
        </div>

        {/* 曝光补偿 */}
        <div className="glass p-4 anim-fade">
          <div style={{fontSize:11,fontWeight:600,color:'#9898ac',marginBottom:12}}>☀️ 曝光补偿</div>
          <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:12}}>
            <button className="btn btn-secondary px-3 text-sm"
              onClick={()=>{const i=Math.max(0,expCompI-1);setExpCompI(i);setProp(0x5010,Math.round(EXP_COMP_VALUES[i]*1000));}}>−</button>
            <span style={{fontSize:28,fontWeight:700,color:'#fbbf24',fontFamily:'JetBrains Mono,monospace',minWidth:80,textAlign:'center'}}>{ecLabel}<span style={{fontSize:12,color:'#9898ac',marginLeft:4}}>EV</span></span>
            <button className="btn btn-secondary px-3 text-sm"
              onClick={()=>{const i=Math.min(EXP_COMP_VALUES.length-1,expCompI+1);setExpCompI(i);setProp(0x5010,Math.round(EXP_COMP_VALUES[i]*1000));}}>+</button>
          </div>
        </div>

        {/* WB + 测光 */}
        <div className="grid grid-cols-2 gap-3">
          <div className="glass p-4">
            <div style={{fontSize:11,fontWeight:600,color:'#9898ac',marginBottom:10}}>🎨 白平衡</div>
            <select className="select w-full text-xs" value={wb} onChange={e=>{setWb(e.target.value);setProp(0x5005,{AUTO:2,INCANDESCENT:4,FLUORESCENT:5,DIRECT_SUNLIGHT:6,FLASH:7,CLOUDY:8,SHADE:9,COLOR_TEMP:12}[e.target.value]);}}>
              {WB_OPTIONS.map(o=><option key={o.v} value={o.v}>{o.n}</option>)}
            </select>
          </div>
          <div className="glass p-4">
            <div style={{fontSize:11,fontWeight:600,color:'#9898ac',marginBottom:10}}>📐 测光</div>
            <select className="select w-full text-xs" value={metering} onChange={e=>setMetering(e.target.value)}>
              <option value="MATRIX">▦ 矩阵测光</option>
              <option value="CENTER_WEIGHTED">◉ 中央重点</option>
              <option value="SPOT">◎ 点测光</option>
              <option value="HIGHLIGHT_WEIGHTED">◈ 高光加权</option>
            </select>
          </div>
        </div>

        {/* 对焦 + 驱动 */}
        <div className="grid grid-cols-2 gap-3">
          <div className="glass p-4">
            <div style={{fontSize:11,fontWeight:600,color:'#9898ac',marginBottom:10}}>🔍 对焦模式</div>
            <div style={{display:'flex',gap:4,marginBottom:8}}>
              {['AF-S','AF-C','MF'].map(f=>(
                <button key={f} style={{flex:1,padding:'8px 0',borderRadius:8,fontSize:11,fontWeight:600,border:'none',cursor:'pointer',
                  background:focus===f?'#3b82f6':'rgba(255,255,255,0.05)',color:focus===f?'#fff':'#9898ac',transition:'all 0.15s'}}
                  onClick={()=>setFocus(f)}>{f}</button>
              ))}
            </div>
            <button className="btn btn-secondary w-full text-[11px]"
              onClick={async ()=>{try{await camera.autoFocus();}catch{}}}>🔍 触发自动对焦</button>
          </div>
          <div className="glass p-4">
            <div style={{fontSize:11,fontWeight:600,color:'#9898ac',marginBottom:10}}>📸 驱动模式</div>
            <select className="select w-full text-xs" defaultValue="S">
              <option value="S">📷 单张拍摄</option>
              <option value="CL">📸 低速连拍</option>
              <option value="CH">📸 高速连拍</option>
              <option value="Q">⏱ 静音拍摄</option>
              <option value="TIMER">⏰ 自拍定时</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}
