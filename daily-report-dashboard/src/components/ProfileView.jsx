import { useEffect, useState } from 'react';
import { T, DISPLAY } from '../theme/tokens';
import { Card, Avi, RoleBadge, TeamBadge, Btn, Lbl, Inp } from './ui/Primitives';
import { PersonalKPI } from './shared/PersonalKPI';
import api from '../lib/api';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';

export function ProfileView({ user, activities, onUpdate }) {
  const [edit,setE]=useState(false);
  const [draft,setD]=useState({...user});
  const [saved,setSaved]=useState(false);
  const [saving, setSaving] = useState(false);
  const [pw, setPw] = useState({ oldPassword:"", newPassword:"", confirmPassword:"" });
  const [pwBusy, setPwBusy] = useState(false);

  useEffect(() => {
    setD({ ...user });
  }, [user]);

  const save = async () => {
    setSaving(true);
    try {
      const { data } = await api.patch('/auth/profile', {
        name: draft.name,
        avatarUrl: draft.avatarUrl || null,
      });
      onUpdate({ ...user, ...data });
      setE(false);
      setSaved(true);
      setTimeout(()=>setSaved(false),2500);
    } catch (error) {
      toast.error(error.response?.data?.error || 'Gagal menyimpan profil');
    } finally {
      setSaving(false);
    }
  };

  const submitPasswordChange = async () => {
    if (!pw.oldPassword || !pw.newPassword || !pw.confirmPassword) {
      return toast.error('Semua field password wajib diisi');
    }
    if (pw.newPassword.length < 6) {
      return toast.error('Password baru minimal 6 karakter');
    }
    if (pw.newPassword !== pw.confirmPassword) {
      return toast.error('Konfirmasi password baru tidak sama');
    }

    setPwBusy(true);
    try {
      const { data } = await api.patch('/auth/password', {
        oldPassword: pw.oldPassword,
        newPassword: pw.newPassword,
      });
      setPw({ oldPassword:"", newPassword:"", confirmPassword:"" });
      toast.success(data.message || 'Password berhasil diubah');
    } catch (error) {
      toast.error(error.response?.data?.error || 'Gagal mengubah password');
    } finally {
      setPwBusy(false);
    }
  };
  return (
    <div style={{ width:"100%", maxWidth:1240 }}>
      <style>{`
        .profile-grid {
          display: grid;
          grid-template-columns: minmax(0, 1.4fr) minmax(320px, 0.9fr);
          gap: 14px;
          align-items: start;
        }
        .profile-stack {
          display: flex;
          flex-direction: column;
          gap: 14px;
          min-width: 0;
        }
        @media (max-width: 1100px) {
          .profile-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>

      <div className="profile-grid">
        <div className="profile-stack">
          <Card p={22}>
            <div style={{ display:"flex",alignItems:"flex-start",gap:14,marginBottom:18 }}>
              <Avi av={user.avatar} team={user.team} sz={60} />
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:18,fontWeight:800,color:T.textPri,fontFamily:DISPLAY }}>{user.name}</div>
                <div style={{ fontSize:12,color:T.textMute,marginTop:2,overflow:"hidden",textOverflow:"ellipsis" }}>{user.email}</div>
                <div style={{ display:"flex",gap:6,marginTop:7,flexWrap:"wrap" }}>
                  <RoleBadge role={user.role} />
                  <TeamBadge team={user.team} />
                </div>
              </div>
              <div>
                {!edit ? <Btn v="sec" sz="sm" onClick={()=>setE(true)}>✏ Edit</Btn>
                : <div style={{ display:"flex",gap:5 }}><Btn v="ghost" sz="sm" onClick={()=>{setE(false);setD({...user});}} disabled={saving}>Batal</Btn><Btn v="teal" sz="sm" onClick={save} disabled={saving}>{saving ? 'Menyimpan...' : 'Simpan'}</Btn></div>}
              </div>
            </div>
            {saved&&<div style={{ marginBottom:12,padding:"7px 12px",background:T.greenLo,border:`1px solid ${T.green}30`,borderRadius:7,fontSize:12,color:T.green }}>✓ Profil berhasil diperbarui</div>}
            <div style={{ display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:12 }}>
              {[{k:"name",l:"Nama",e:true},{k:"email",l:"Email",e:false},{k:"position",l:"Jabatan",e:true},{k:"dept",l:"Departemen",e:true}].map(f=>(
                <div key={f.k} style={{ minWidth:0 }}>
                  <Lbl>{f.l}</Lbl>
                  {edit&&f.e ? <Inp value={draft[f.k]||""} onChange={e=>setD(p=>({...p,[f.k]:e.target.value}))} />
                  : <div style={{ fontSize:13,color:f.e?T.textPri:T.textMute,padding:"8px 0",overflow:"hidden",textOverflow:"ellipsis" }}>{user[f.k]||<span style={{ color:T.textMute,fontStyle:"italic" }}>Belum diisi</span>}</div>}
                </div>
              ))}
            </div>
          </Card>

          <PersonalKPI user={user} activities={activities} />
        </div>

        <div className="profile-stack">
          <Card p={22}>
            <div style={{ fontSize:15, fontWeight:700, color:T.textPri, marginBottom:8 }}>Keamanan Akun</div>
            <p style={{ fontSize:12, color:T.textMute, margin:"0 0 16px", lineHeight:1.5 }}>
              Ubah password akun Anda sendiri dari halaman profil ini.
            </p>
            <div style={{ display:"grid", gap:12 }}>
              <Inp
                type="password"
                label="Password Lama"
                value={pw.oldPassword}
                onChange={(e)=>setPw((prev)=>({ ...prev, oldPassword: e.target.value }))}
              />
              <Inp
                type="password"
                label="Password Baru"
                value={pw.newPassword}
                onChange={(e)=>setPw((prev)=>({ ...prev, newPassword: e.target.value }))}
              />
              <Inp
                type="password"
                label="Konfirmasi Password Baru"
                value={pw.confirmPassword}
                onChange={(e)=>setPw((prev)=>({ ...prev, confirmPassword: e.target.value }))}
              />
              <Btn v="teal" onClick={submitPasswordChange} disabled={pwBusy} style={{ justifyContent:"center" }}>
                {pwBusy ? 'Mengubah Password...' : 'Ubah Password'}
              </Btn>
            </div>
          </Card>
          <JiraIntegrator />
          <TelegramIntegrator />
        </div>
      </div>
    </div>
  );
}

function JiraIntegrator() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [notice, setNotice] = useState("");

  const { data: status, refetch } = useQuery({
    queryKey: ['jiraStatus'],
    queryFn: async () => {
      const { data } = await api.get('/jira/status');
      return data;
    }
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const jiraStatus = params.get('jira');
    const message = params.get('message');
    if (!jiraStatus) return;

    if (jiraStatus === 'connected') {
      setNotice("Akun Jira berhasil terhubung.");
      refetch();
    } else if (jiraStatus === 'failed') {
      setErr(message || "Koneksi Jira gagal.");
    }

    params.delete('jira');
    params.delete('message');
    const next = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ''}`;
    window.history.replaceState({}, '', next);
  }, [refetch]);

  const beginConnect = async () => {
    setBusy(true); setErr(""); setNotice("");
    try {
      const { data } = await api.post('/jira/connect');
      window.location.href = data.authUrl;
    } catch (e) {
      setErr(e.response?.data?.error || "Gagal memulai koneksi Jira");
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true); setErr(""); setNotice("");
    try {
      await api.post('/jira/disconnect');
      setNotice("Koneksi Jira diputus.");
      refetch();
    } catch (e) {
      setErr(e.response?.data?.error || "Gagal memutus koneksi Jira");
    } finally {
      setBusy(false);
    }
  };

  const isLinked = status?.isLinked;

  return (
    <Card p={22} style={{ marginTop: 14 }}>
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8 }}>
        <div style={{ width:28, height:28, borderRadius:"50%", background:T.jiraLo || T.indigoLo, color:T.jira || T.indigoHi, display:"flex", alignItems:"center", justifyContent:"center", fontSize:16 }}>🔗</div>
        <div style={{ fontSize:15, fontWeight:700, color:T.textPri }}>Integrasi Jira</div>
        {isLinked && <div style={{ marginLeft:"auto", fontSize:11, color:T.green, background:T.greenLo, padding:"4px 10px", borderRadius:20, fontWeight:700 }}>✓ Terhubung</div>}
      </div>

      <p style={{ fontSize:12, color:T.textMute, margin:"0 0 16px", lineHeight:1.5 }}>
        Hubungkan akun Jira Anda sekali saja agar app bisa mengenali <strong>accountId</strong> Jira dan menyiapkan sinkronisasi worklog otomatis.
      </p>

      {err && <div style={{ background:T.redLo, color:T.red, fontSize:12, padding:"8px 12px", borderRadius:8, marginBottom:10 }}>{err}</div>}
      {notice && <div style={{ background:T.greenLo, color:T.green, fontSize:12, padding:"8px 12px", borderRadius:8, marginBottom:10 }}>{notice}</div>}

      {isLinked ? (
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          <div style={{ background:T.surfaceHi, border:`1px solid ${T.border}`, borderRadius:8, padding:14, fontSize:13 }}>
            <div style={{ color:T.textPri, fontWeight:700 }}>{status?.displayName || "Jira User"}</div>
            <div style={{ color:T.textMute, marginTop:4 }}>accountId: {status?.accountId || "—"}</div>
            <div style={{ color:T.textMute, marginTop:2 }}>cloudId: {status?.cloudId || "—"}</div>
          </div>
          <div><Btn v="ghost" onClick={disconnect} disabled={busy}>{busy ? "Memproses..." : "Putuskan Koneksi Jira"}</Btn></div>
        </div>
      ) : (
        <Btn v="primary" onClick={beginConnect} disabled={busy}>{busy ? "Memproses..." : "Hubungkan ke Jira →"}</Btn>
      )}
    </Card>
  );
}

function TelegramIntegrator() {
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const { data: status, refetch } = useQuery({
    queryKey: ['telegramStatus'],
    queryFn: async () => {
      const { data } = await api.get('/telegram/status');
      return data;
    }
  });

  const generateLink = async () => {
    setBusy(true); setErr("");
    try {
      const { data } = await api.post('/telegram/generate-link');
      setToken(data.token);
      refetch(); // In case it immediately updates
    } catch (e) {
      setErr(e.response?.data?.error || "Gagal membuat tautan");
    } finally {
      setBusy(false);
    }
  };

  const isLinked = status?.isLinked;

  return (
    <Card p={22} style={{ marginTop: 14 }}>
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8 }}>
        <div style={{ width:28, height:28, borderRadius:"50%", background:T.indigoLo, color:T.indigoHi, display:"flex", alignItems:"center", justifyContent:"center", fontSize:16 }}>💬</div>
        <div style={{ fontSize:15, fontWeight:700, color:T.textPri }}>Integrasi Telegram Bot</div>
        {isLinked && <div style={{ marginLeft:"auto", fontSize:11, color:T.green, background:T.greenLo, padding:"4px 10px", borderRadius:20, fontWeight:700 }}>✓ Terhubung</div>}
      </div>

      <p style={{ fontSize:12, color:T.textMute, margin:"0 0 16px", lineHeight:1.5 }}>
        Sambungkan akun Anda ke Bot Telegram agar bisa melapor Log Aktivitas harian tanpa harus membuka halaman web.
      </p>

      {isLinked ? (
        <div style={{ background:T.surfaceHi, border:`1px solid ${T.border}`, borderRadius:8, padding:14, fontSize:13 }}>
          Akun Anda sudah sukses ditautkan dengan memori Bot! Coba kirim pesan <strong>/log</strong> ke bot.
        </div>
      ) : (
        <>
          {err && <div style={{ background:T.redLo, color:T.red, fontSize:12, padding:"8px 12px", borderRadius:8, marginBottom:10 }}>{err}</div>}
          
          {token ? (
            <div style={{ background:T.indigoLo, border:`1px solid ${T.indigo}40`, borderRadius:8, padding:16, textAlign:"center" }}>
              <div style={{ fontSize:11, color:T.indigo, fontWeight:600, marginBottom:6 }}>TOKEN SINKRONISASI ANDA:</div>
              <div style={{ fontSize:28, fontWeight:800, color:T.indigoHi, fontFamily:DISPLAY, letterSpacing:"0.1em", marginBottom:12 }}>{token}</div>
              <div style={{ fontSize:12, color:T.indigo }}>
                1. Buka Telegram dan cari <strong>@sdt_elogs_bot</strong><br/>
                2. Ketik perintah: <strong>/link {token}</strong>
              </div>
            </div>
          ) : (
            <Btn v="primary" onClick={generateLink} disabled={busy}>{busy ? "Memproses..." : "Tautkan ke Telegram →"}</Btn>
          )}
        </>
      )}
    </Card>
  );
}
