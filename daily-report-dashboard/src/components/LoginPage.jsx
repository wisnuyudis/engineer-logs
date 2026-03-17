import { useState } from 'react';
import { T, FONT, DISPLAY, MONO } from '../theme/tokens';
import { DEMO_ACCOUNTS } from '../data/mockData';
import { Card, Inp, PwInp, Btn, Divider, Avi, RoleBadge } from './ui/Primitives';

import api from '../lib/api';

export function LoginPage({ onLogin }) {
  const [email,setEmail]=useState("");
  const [pw,setPw]=useState("");
  const [err,setErr]=useState("");
  const [loading,setL]=useState(false);
  
  const tryLogin = async () => {
    setErr("");
    setL(true);
    try {
      const { data } = await api.post('/auth/login', { email: email.trim(), password: pw });
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      onLogin(data.user);
    } catch (error) {
      setErr(error.response?.data?.error || "Koneksi ke server gagal.");
    } finally {
      setL(false);
    }
  };

  return (
    <div style={{ minHeight:"100vh",background:T.bg,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:FONT,position:"relative",overflow:"hidden" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700;800&family=Syne:wght@700;800&family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet" />
      {/* Background grid */}
      <div style={{ position:"absolute",inset:0,backgroundImage:`linear-gradient(${T.border} 1px,transparent 1px),linear-gradient(90deg,${T.border} 1px,transparent 1px)`,backgroundSize:"40px 40px",opacity:.3 }} />
      {/* Glow orb */}
      <div style={{ position:"absolute",width:500,height:500,borderRadius:"50%",background:`radial-gradient(circle,${T.indigo}20,transparent 70%)`,top:"50%",left:"50%",transform:"translate(-50%,-50%)",pointerEvents:"none" }} />
      
      <div style={{ width:400,position:"relative",zIndex:1 }}>
        <div style={{ textAlign:"center",marginBottom:28 }}>
          <div style={{ width:44,height:44,borderRadius:12,background:`linear-gradient(135deg,${T.indigo},${T.indigoHi})`,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 12px",boxShadow:`0 8px 24px ${T.indigo}50` }}>
            <span style={{ color:"#fff",fontWeight:800,fontSize:18,fontFamily:DISPLAY }}>S</span>
          </div>
          <div style={{ fontSize:20,fontWeight:800,color:T.textPri,fontFamily:DISPLAY,letterSpacing:"-.02em" }}>EngineerLog</div>
          <div style={{ fontSize:10,color:T.textMute,marginTop:2,letterSpacing:".1em" }}>SERAPHIM DIGITAL TECHNOLOGY</div>
        </div>
        
        <Card p={28} glow={T.indigo}>
          <div style={{ fontSize:16,fontWeight:700,color:T.textPri,marginBottom:3,fontFamily:DISPLAY }}>Selamat datang</div>
          <p style={{ margin:"0 0 20px",fontSize:12,color:T.textMute }}>Masuk untuk catat aktivitas harian</p>
          <div style={{ display:"flex",flexDirection:"column",gap:12 }}>
            <Inp label="Email" type="email" placeholder="nama@seraphim.id" value={email} onChange={e=>{setEmail(e.target.value);setErr("");}} />
            <PwInp label="Password" value={pw} error={err} onChange={e=>{setPw(e.target.value);setErr("");}} />
            {err&&<div style={{ background:T.redLo,border:`1px solid ${T.red}30`,borderRadius:7,padding:"8px 11px",fontSize:12,color:T.red }}>🚫 {err}</div>}
            <Btn v="primary" sz="lg" style={{ width:"100%",justifyContent:"center",marginTop:4 }} onClick={tryLogin} disabled={loading||!email||!pw}>
              {loading?"Memverifikasi...":"Masuk →"}
            </Btn>
          </div>
          
          <Divider />
          <div style={{ fontSize:10,fontWeight:700,color:T.textMute,textTransform:"uppercase",letterSpacing:".07em",marginBottom:8 }}>Demo Accounts</div>
          <div style={{ display:"flex",flexDirection:"column",gap:5 }}>
            {DEMO_ACCOUNTS.map(a=>(
              <button key={a.id} onClick={()=>{setEmail(a.email);setPw(a.password);setErr("");}}
                style={{ display:"flex",alignItems:"center",gap:8,padding:"7px 10px",borderRadius:8,background:T.surfaceHi,border:`1px solid ${T.border}`,cursor:"pointer",fontFamily:FONT,width:"100%",transition:"border-color .15s" }}
                onMouseEnter={e=>e.currentTarget.style.borderColor=T.indigo+"60"} onMouseLeave={e=>e.currentTarget.style.borderColor=T.border}>
                <Avi av={a.avatar} team={a.team} sz={26} />
                <div style={{ flex:1,textAlign:"left" }}>
                  <div style={{ fontSize:12,fontWeight:600,color:T.textPri }}>{a.name}</div>
                  <div style={{ fontSize:10,color:T.textMute,fontFamily:MONO }}>{a.password}</div>
                </div>
                <RoleBadge role={a.role} />
              </button>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
