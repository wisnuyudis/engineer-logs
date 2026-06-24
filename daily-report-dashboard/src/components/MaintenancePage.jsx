import { T, FONT, DISPLAY } from '../theme/tokens';

export function MaintenancePage({ status, currentUser, onRetry }) {
  return (
    <div style={{ minHeight:'100vh', background:T.bg, color:T.textPri, fontFamily:FONT, display:'flex', alignItems:'center', justifyContent:'center', padding:22 }}>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Inter+Tight:wght@600;700;800&family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet" />
      <div style={{ width:'min(560px, 100%)', border:`1px solid ${T.border}`, background:`linear-gradient(180deg, ${T.surface}, ${T.surfaceHi})`, borderRadius:14, padding:24, boxShadow:'0 24px 70px rgba(0,0,0,.28)' }}>
        <div style={{ width:42,height:42,borderRadius:12,background:T.amberLo,color:T.amber,display:'flex',alignItems:'center',justifyContent:'center',fontSize:22,marginBottom:16 }}>!</div>
        <div style={{ fontSize:22,fontWeight:800,fontFamily:DISPLAY,marginBottom:8 }}>EngineerLog sedang maintenance</div>
        <div style={{ fontSize:13,lineHeight:1.6,color:T.textSec,marginBottom:18 }}>
          {status?.message || 'Aplikasi sedang dalam proses maintenance untuk migrasi atau deployment. Silakan coba lagi beberapa saat.'}
        </div>
        <div style={{ display:'grid', gap:8, fontSize:12, color:T.textMute, background:T.bg, border:`1px solid ${T.border}`, borderRadius:10, padding:12, marginBottom:16 }}>
          <div>Status: <strong style={{ color:T.amber }}>Maintenance aktif</strong></div>
          {status?.updatedAt && <div>Updated: {new Date(status.updatedAt).toLocaleString('id-ID')}</div>}
          {status?.forcedByEnv && <div>Mode ini dipaksa oleh environment server.</div>}
          {currentUser?.role === 'admin' && status?.adminBypass && <div>Admin bypass tersedia dari dashboard.</div>}
        </div>
        <button onClick={onRetry} style={{ height:38,padding:'0 14px',borderRadius:10,border:`1px solid ${T.borderHi}`,background:T.surfaceHi,color:T.textPri,fontFamily:FONT,fontWeight:800,cursor:'pointer' }}>
          Coba Lagi
        </button>
      </div>
    </div>
  );
}
