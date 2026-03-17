import { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { T, FONT, DISPLAY } from '../theme/tokens';
import { Card, PwInp, Btn } from './ui/Primitives';
import { toast } from 'sonner';
import api from '../lib/api';

export function ActivatePage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');
  
  const [pw, setPw] = useState("");
  const [cpw, setCpw] = useState("");
  const [busy, setBusy] = useState(false);

  const activate = async () => {
    if (pw !== cpw) return toast.error("Password tidak cocok");
    if (pw.length < 6) return toast.error("Password minimal 6 karakter");

    setBusy(true);
    try {
      await api.post('/activate', { token, password: pw });
      toast.success("Akun berhasil diaktivasi! Silakan login.");
      navigate('/');
    } catch (error) {
      toast.error(error.response?.data?.error || "Gagal aktivasi akun");
    } finally {
      setBusy(false);
    }
  };

  if (!token) {
    return (
      <div style={{ minHeight:"100vh",background:T.bg,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:FONT,color:T.textPri }}>
        <Card p={30} style={{ textAlign:"center" }}>
          <h2>⚠ Link tidak valid</h2>
          <p style={{ color:T.textMute }}>Token aktivasi tidak ditemukan.</p>
          <Btn v="primary" onClick={()=>navigate('/')}>Ke Halaman Login</Btn>
        </Card>
      </div>
    );
  }

  return (
    <div style={{ minHeight:"100vh",background:T.bg,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:FONT,position:"relative",overflow:"hidden" }}>
      <div style={{ position:"absolute",inset:0,backgroundImage:`linear-gradient(${T.border} 1px,transparent 1px),linear-gradient(90deg,${T.border} 1px,transparent 1px)`,backgroundSize:"40px 40px",opacity:.3 }} />
      <div style={{ position:"absolute",width:500,height:500,borderRadius:"50%",background:`radial-gradient(circle,${T.teal}20,transparent 70%)`,top:"50%",left:"50%",transform:"translate(-50%,-50%)",pointerEvents:"none" }} />
      
      <div style={{ width:400,position:"relative",zIndex:1 }}>
        <div style={{ textAlign:"center",marginBottom:28 }}>
          <div style={{ fontSize:20,fontWeight:800,color:T.textPri,fontFamily:DISPLAY,letterSpacing:"-.02em" }}>EngineerLog</div>
          <div style={{ fontSize:10,color:T.textMute,marginTop:2,letterSpacing:".1em" }}>Aktivasi Akun</div>
        </div>
        
        <Card p={28} glow={T.teal}>
          <div style={{ fontSize:16,fontWeight:700,color:T.textPri,marginBottom:3,fontFamily:DISPLAY }}>Buat Password</div>
          <p style={{ margin:"0 0 20px",fontSize:12,color:T.textMute }}>Masukkan password baru untuk akun kamu</p>
          
          <div style={{ display:"flex",flexDirection:"column",gap:12 }}>
            <PwInp label="Password Baru" value={pw} onChange={e=>setPw(e.target.value)} />
            <PwInp label="Konfirmasi Password" value={cpw} onChange={e=>setCpw(e.target.value)} />
            
            <Btn v="teal" sz="lg" style={{ width:"100%",justifyContent:"center",marginTop:8 }} onClick={activate} disabled={busy||!pw||!cpw}>
              {busy?"Memproses...":"Aktivasi & Simpan ✓"}
            </Btn>
          </div>
        </Card>
      </div>
    </div>
  );
}
