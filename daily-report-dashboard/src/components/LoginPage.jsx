import { useState } from 'react';
import { T, FONT, DISPLAY, MONO } from '../theme/tokens';

import { Card, Inp, PwInp, Btn, Divider, Avi, RoleBadge } from './ui/Primitives';

import api from '../lib/api';

export function LoginPage({ onLogin }) {
  const [email,setEmail]=useState("");
  const [pw,setPw]=useState("");
  const [otp,setOtp]=useState("");
  const [err,setErr]=useState("");
  const [loading,setL]=useState(false);
  const [mfa,setMfa]=useState(null);

  const completeLogin = (data) => {
    localStorage.setItem('token', data.accessToken || data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('auth:updated', { detail: { user: data.user, token: data.accessToken || data.token } }));
    }
    onLogin(data.user);
  };
  
  const tryLogin = async () => {
    setErr("");
    setL(true);
    try {
      const { data } = await api.post('/auth/login', { email: email.trim(), password: pw });
      if (data.mfaSetupRequired || data.mfaRequired) {
        setMfa(data);
        setOtp("");
        return;
      }
      completeLogin(data);
    } catch (error) {
      setErr(error.response?.data?.error || "Koneksi ke server gagal.");
    } finally {
      setL(false);
    }
  };

  const verifyMfa = async () => {
    setErr("");
    setL(true);
    try {
      const endpoint = mfa?.mfaSetupRequired ? '/auth/mfa/setup/verify' : '/auth/mfa/login';
      const { data } = await api.post(endpoint, { challengeToken: mfa.challengeToken, code: otp });
      completeLogin(data);
    } catch (error) {
      setErr(error.response?.data?.error || "Kode authenticator tidak valid.");
    } finally {
      setL(false);
    }
  };

  return (
    <div style={{ minHeight:"100vh",background:T.bg,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:FONT,position:"relative",overflow:"hidden" }}>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Inter+Tight:wght@600;700;800&family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet" />
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
          {!mfa ? (
            <>
              <div style={{ fontSize:16,fontWeight:700,color:T.textPri,marginBottom:3,fontFamily:DISPLAY }}>Selamat datang</div>
              <p style={{ margin:"0 0 20px",fontSize:12,color:T.textMute }}>Masuk untuk catat aktivitas harian</p>
              <div style={{ display:"flex",flexDirection:"column",gap:12 }}>
                <Inp label="Email" type="email" placeholder="nama@sdt.co.id" value={email} onChange={e=>{setEmail(e.target.value);setErr("");}} />
                <PwInp label="Password" value={pw} error={err} onChange={e=>{setPw(e.target.value);setErr("");}} />
                {err&&<div style={{ background:T.redLo,border:`1px solid ${T.red}30`,borderRadius:7,padding:"8px 11px",fontSize:12,color:T.red }}>🚫 {err}</div>}
                <Btn v="primary" sz="lg" style={{ width:"100%",justifyContent:"center",marginTop:4 }} onClick={tryLogin} disabled={loading||!email||!pw}>
                  {loading?"Memverifikasi...":"Masuk →"}
                </Btn>
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize:16,fontWeight:700,color:T.textPri,marginBottom:3,fontFamily:DISPLAY }}>
                {mfa.mfaSetupRequired ? 'Aktifkan MFA' : 'Verifikasi MFA'}
              </div>
              <p style={{ margin:"0 0 16px",fontSize:12,color:T.textMute,lineHeight:1.5 }}>
                {mfa.mfaSetupRequired
                  ? 'Scan atau input secret ini di Google Authenticator / Microsoft Authenticator, lalu masukkan kode 6 digit.'
                  : 'Masukkan kode 6 digit dari aplikasi authenticator.'}
              </p>
              {mfa.mfaSetupRequired && (
                <div style={{ background:T.surfaceHi,border:`1px solid ${T.border}`,borderRadius:10,padding:12,marginBottom:12 }}>
                  <div style={{ display:"flex",justifyContent:"center",marginBottom:12 }}>
                    <div style={{ background:"#fff",padding:10,borderRadius:10,border:`1px solid ${T.border}` }}>
                      <img
                        src={`https://chart.googleapis.com/chart?cht=qr&chs=220x220&chl=${encodeURIComponent(mfa.otpauthUrl)}`}
                        alt="QR Code MFA"
                        width="220"
                        height="220"
                        style={{ display:"block" }}
                      />
                    </div>
                  </div>
                  <div style={{ fontSize:10,color:T.textMute,textTransform:'uppercase',letterSpacing:'.07em',marginBottom:6 }}>Manual Secret</div>
                  <div style={{ fontSize:14,color:T.textPri,fontFamily:MONO,fontWeight:800,wordBreak:'break-all' }}>{mfa.secret}</div>
                  <Divider my={10} />
                  <div style={{ fontSize:10,color:T.textMute,lineHeight:1.5,wordBreak:'break-all' }}>URI: {mfa.otpauthUrl}</div>
                </div>
              )}
              <div style={{ display:"flex",flexDirection:"column",gap:12 }}>
                <Inp label="Kode Authenticator" inputMode="numeric" maxLength="6" value={otp} onChange={e=>{setOtp(e.target.value.replace(/\D/g,'').slice(0,6));setErr("");}} placeholder="123456" mono />
                {err&&<div style={{ background:T.redLo,border:`1px solid ${T.red}30`,borderRadius:7,padding:"8px 11px",fontSize:12,color:T.red }}>🚫 {err}</div>}
                <Btn v="primary" sz="lg" style={{ width:"100%",justifyContent:"center",marginTop:4 }} onClick={verifyMfa} disabled={loading||otp.length!==6}>
                  {loading?"Memverifikasi...":mfa.mfaSetupRequired?"Aktifkan & Masuk":"Verifikasi & Masuk"}
                </Btn>
                <Btn v="ghost" sz="md" style={{ width:"100%",justifyContent:"center" }} onClick={()=>{setMfa(null);setOtp("");setPw("");setErr("");}} disabled={loading}>
                  Kembali ke Login
                </Btn>
              </div>
            </>
          )}
          
        </Card>
      </div>
    </div>
  );
}
