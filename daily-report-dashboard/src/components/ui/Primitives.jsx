import { useState } from 'react';
import { T, FONT, DISPLAY, MONO } from '../../theme/tokens';
import { ROLES, teamOf } from '../../constants/taxonomy';

export function Tag({ color, lo, children, small }) {
  return (
    <span style={{ padding:small?"2px 7px":"3px 10px", borderRadius:20, fontSize:small?9:10, fontWeight:700,
      background:lo||color+"22", color, border:`1px solid ${color}33`,
      textTransform:"uppercase", letterSpacing:".05em", display:"inline-flex", alignItems:"center", gap:3 }}>
      {children}
    </span>
  );
}
export function RoleBadge({ role }) {
  const r = ROLES[role]; if(!r) return null;
  const team = r.team || teamOf(role);
  const color = team === "presales" ? T.violet : team === "delivery" ? T.teal : T.amber;
  const lo = team === "presales" ? T.violetLo : team === "delivery" ? T.tealLo : T.amberLo;
  return <Tag color={color} lo={lo}>{r.label}</Tag>;
}
export function TeamBadge({ team }) {
  if(team==="presales") return <Tag color={T.violet} lo={T.violetLo}>Pre-Sales</Tag>;
  if(team==="delivery") return <Tag color={T.teal}   lo={T.tealLo}>Delivery</Tag>;
  return <Tag color={T.textSec} lo={T.border}>All Teams</Tag>;
}
export function Pill({ active, color, lo, children, onClick, small }) {
  return (
    <button onClick={onClick} style={{ padding:small?"4px 11px":"5px 14px", borderRadius:20, fontSize:small?11:12, fontWeight:active?700:400,
      cursor:"pointer", border:`1.5px solid ${active?color:T.border}`, fontFamily:FONT,
      background:active?lo:T.surface, color:active?color:T.textSec, transition:"all .15s" }}>
      {children}
    </button>
  );
}
export function Btn({ children, v="primary", sz="md", style:s={}, ...p }) {
  const S = {
    sm:{padding:"5px 13px",fontSize:11},
    md:{padding:"8px 16px",fontSize:13},
    lg:{padding:"11px 22px",fontSize:14},
  };
  const V = {
    primary: { background:`linear-gradient(135deg,${T.indigo},${T.indigoHi})`, color:"#fff", border:"none", boxShadow:`0 4px 14px ${T.indigo}50` },
    teal:    { background:`linear-gradient(135deg,#0D9488,${T.teal})`,          color:"#fff", border:"none", boxShadow:`0 4px 14px ${T.teal}40` },
    amber:   { background:`linear-gradient(135deg,#D97706,${T.amber})`,         color:"#000", border:"none" },
    danger:  { background:T.redLo,    color:T.red,    border:`1px solid ${T.red}30` },
    ghost:   { background:"transparent", color:T.textSec, border:`1px solid ${T.border}` },
    sec:     { background:T.surface,   color:T.textSec, border:`1px solid ${T.border}` },
    green:   { background:T.greenLo,   color:T.green,  border:`1px solid ${T.green}30` },
  };
  return (
    <button {...p} style={{ borderRadius:8, fontWeight:600, cursor:"pointer", fontFamily:FONT,
      transition:"all .15s", display:"inline-flex", alignItems:"center", gap:5,
      ...(S[sz]||S.md), ...(V[v]||V.primary), ...s, opacity:p.disabled?.6:1 }}>
      {children}
    </button>
  );
}
export function Card({ children, p=20, style:s={}, glow, onClick }) {
  return (
    <div onClick={onClick} style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:14,
      boxShadow: glow ? `0 0 0 1px ${glow}30, 0 4px 24px ${glow}12` : "0 2px 16px rgba(0,0,0,.3)",
      padding:p, ...s }}>
      {children}
    </div>
  );
}
export function Modal({ open, onClose, children, width=500 }) {
  if(!open) return null;
  return (
    <div onClick={e=>e.target===e.currentTarget&&onClose()} style={{ position:"fixed",inset:0,background:"rgba(0,0,0,.75)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200,backdropFilter:"blur(8px)" }}>
      <div style={{ background:T.surface,border:`1px solid ${T.borderHi}`,borderRadius:18,padding:28,width,maxWidth:"94vw",maxHeight:"92vh",overflowY:"auto",boxShadow:"0 32px 80px rgba(0,0,0,.6)" }}>
        {children}
      </div>
    </div>
  );
}
export function MHead({ title, sub, onClose }) {
  return (
    <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20 }}>
      <div>
        <h2 style={{ margin:0,fontSize:17,fontWeight:700,color:T.textPri,fontFamily:DISPLAY }}>{title}</h2>
        {sub && <p style={{ margin:"3px 0 0",fontSize:12,color:T.textSec }}>{sub}</p>}
      </div>
      <button onClick={onClose} style={{ background:T.surfaceHi,border:`1px solid ${T.border}`,borderRadius:6,color:T.textSec,width:28,height:28,cursor:"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}>×</button>
    </div>
  );
}
export function Lbl({ children, required }) {
  return (
    <div style={{ fontSize:10,fontWeight:700,color:T.textSec,textTransform:"uppercase",letterSpacing:".07em",marginBottom:5 }}>
      {children}{required&&<span style={{ color:T.red }}> *</span>}
    </div>
  );
}
export function Inp({ label, required, error, ...p }) {
  const [f,sf] = useState(false);
  return (
    <div>
      {label && <Lbl required={required}>{label}</Lbl>}
      <input {...p} onFocus={e=>{sf(true);p.onFocus?.(e)}} onBlur={e=>{sf(false);p.onBlur?.(e)}}
        style={{ width:"100%", background:T.surfaceHi, color:T.textPri, fontSize:13,
          border:`1.5px solid ${error?T.red:f?T.indigo:T.border}`, borderRadius:8,
          padding:"8px 12px", outline:"none", boxSizing:"border-box", fontFamily:p.mono?MONO:FONT,
          transition:"border-color .15s", ...p.style }} />
      {error && <div style={{ fontSize:10,color:T.red,marginTop:3 }}>⚠ {error}</div>}
    </div>
  );
}
export function PwInp({ label, value, onChange, error }) {
  const [show,ss]=useState(false),[f,sf]=useState(false);
  return (
    <div>
      <Lbl required>{label}</Lbl>
      {error&&<div style={{ fontSize:10,color:T.red,marginBottom:3 }}>⚠ {error}</div>}
      <div style={{ position:"relative" }}>
        <input type={show?"text":"password"} value={value} onChange={onChange}
          onFocus={()=>sf(true)} onBlur={()=>sf(false)}
          style={{ width:"100%",background:T.surfaceHi,color:T.textPri,fontSize:13,border:`1.5px solid ${error?T.red:f?T.indigo:T.border}`,borderRadius:8,padding:"8px 90px 8px 12px",outline:"none",boxSizing:"border-box",fontFamily:FONT }} />
        <button onClick={()=>ss(v=>!v)} style={{ position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",color:T.textMute,cursor:"pointer",fontSize:11,fontFamily:FONT }}>
          {show?"Sembunyikan":"Tampilkan"}
        </button>
      </div>
    </div>
  );
}
export function Avi({ av, team, sz=36 }) {
  const g = team==="presales" ? `linear-gradient(135deg,${T.violet},#C084FC)` : team==="delivery" ? `linear-gradient(135deg,#0D9488,${T.teal})` : `linear-gradient(135deg,${T.indigo},${T.indigoHi})`;
  return (
    <div style={{ width:sz,height:sz,borderRadius:"50%",background:g,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:sz*.32,fontWeight:800,color:"#fff",letterSpacing:".02em" }}>
      {av}
    </div>
  );
}
export function Divider({ my=14 }) {
  return <div style={{ height:1, background:T.border, margin:`${my}px 0` }} />;
}
