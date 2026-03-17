import { useState, useMemo } from 'react';
import { T, FONT, DISPLAY } from '../theme/tokens';
import { ROLES, isAdmin, isMgr } from '../constants/taxonomy';
import { calcKPI } from '../utils/kpi';
import { Pill, Card, Avi, RoleBadge, Btn, Modal, MHead, Inp, Lbl, PwInp, Tag } from './ui/Primitives';
import { ScoreRing } from './ui/Score';
import { toast } from 'sonner';
import api from '../lib/api';

const SMTP_PROVS=[
  {id:"gmail",    label:"Gmail",       host:"smtp.gmail.com",                         port:"587"},
  {id:"sendgrid", label:"SendGrid",    host:"smtp.sendgrid.net",                      port:"587"},
  {id:"ses",      label:"Amazon SES",  host:"email-smtp.us-east-1.amazonaws.com",     port:"587"},
  {id:"custom",   label:"Custom SMTP", host:"",                                        port:"587"},
];

function InviteModal({ open, onClose, members, onAdd }) {
  const [step,setStep]=useState(1);
  const [form,setF]=useState({name:"",email:"",role:"delivery"});
  const [smtp,setS]=useState({provider:"gmail",host:"smtp.gmail.com",port:"587",user:"",pass:""});
  const [errs,setE]=useState({});
  const [busy,setBusy]=useState(false);

  const sf=(k,v)=>{setF(p=>({...p,[k]:v}));setE(p=>({...p,[k]:""}));};

  const validateStep1=()=>{
    const e={};
    if(!form.name.trim()) e.name="Nama wajib";
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email="Format email tidak valid";
    if(members.find(m=>m.email.toLowerCase()===form.email.toLowerCase())) e.email="Email sudah terdaftar";
    setE(e); return !Object.keys(e).length;
  };
  const validateStep2=()=>{
    const e={};
    if(smtp.provider==="custom"&&!smtp.host.trim()) e.host="Host wajib";
    if(!smtp.user.trim()) e.user="Username / API key wajib";
    if(!smtp.pass.trim()) e.pass="Password wajib";
    setE(e); return !Object.keys(e).length;
  };

  const send = async () => {
    setBusy(true);
    try {
      const { data } = await api.post('/invite', {
        name: form.name.trim(),
        email: form.email.trim(),
        role: form.role,
        supervisorId: form.supervisorId || undefined,
        team: ROLES[form.role]?.team || 'delivery'
      });
      // We rely on backend return message or mock update
      const av=form.name.trim().split(" ").map(w=>w[0].toUpperCase()).slice(0,2).join("");
      const t=ROLES[form.role]?.team||"delivery";
      
      onAdd({ 
        id: Date.now(), 
        ...form, 
        avatar:av, 
        team:t,
        position:"", 
        dept:t==="presales"?"Pre-Sales":"Delivery",
        status:"invited", 
        joinDate:new Date().toISOString().split("T")[0] 
      });
      
      setStep(4);
      toast.success('Undangan berhasil dikirim!');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Gagal mengirim undangan');
      setStep(3); // stay on preview
    } finally {
      setBusy(false);
    }
  };

  const reset=()=>{setStep(1);setF({name:"",email:"",role:"delivery"});setS({provider:"gmail",host:"smtp.gmail.com",port:"587",user:"",pass:""});setE({});setBusy(false);};
  const close=()=>{reset();onClose();};

  const rc=ROLES[form.role];

  return (
    <Modal open={open} onClose={close} width={480}>
      {step===4 ? (
        <div style={{ textAlign:"center",padding:"28px 0" }}>
          <div style={{ width:52,height:52,borderRadius:"50%",background:T.greenLo,border:`2px solid ${T.green}40`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,margin:"0 auto 12px" }}>✓</div>
          <div style={{ fontSize:16,fontWeight:700,color:T.green,marginBottom:6,fontFamily:DISPLAY }}>Undangan Terkirim!</div>
          <p style={{ fontSize:13,color:T.textSec,margin:"0 0 16px" }}>Email dikirim ke <strong style={{ color:T.textPri }}>{form.email}</strong>. Link aktivasi berlaku 24 jam.</p>
          <Btn v="teal" style={{ width:"100%",justifyContent:"center" }} onClick={close}>Selesai ✓</Btn>
        </div>
      ) : (
        <>
          <MHead title={["","Undang Member Baru","Konfigurasi SMTP","Preview Email"][step]} sub={["","Isi data member yang akan diundang","Setup email server untuk kirim undangan","Cek email sebelum dikirim"][step]} onClose={close} />

          {/* Step indicator */}
          <div style={{ display:"flex",alignItems:"center",gap:4,marginBottom:20 }}>
            {["Data","SMTP","Preview"].map((s,i)=>{
              const done=step>i+1, active=step===i+1;
              return <div key={i} style={{ display:"flex",alignItems:"center",gap:4 }}>
                <div style={{ width:20,height:20,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700,color:"#fff",flexShrink:0,
                  background:done?T.green:active?T.indigo:T.border }}>{done?"✓":i+1}</div>
                <span style={{ fontSize:11,fontWeight:active?700:400,color:done?T.green:active?T.textPri:T.textMute,whiteSpace:"nowrap" }}>{s}</span>
                {i<2&&<div style={{ width:16,height:1,background:T.border,margin:"0 2px" }} />}
              </div>;
            })}
          </div>

          {/* Step 1 */}
          {step===1 && (
            <div style={{ display:"flex",flexDirection:"column",gap:12 }}>
              <Inp label="Nama Lengkap" required value={form.name} error={errs.name} onChange={e=>sf("name",e.target.value)} placeholder="Budi Santoso" />
              <Inp label="Email" required type="email" value={form.email} error={errs.email} onChange={e=>sf("email",e.target.value)} placeholder="budi@seraphim.id" />
              <div>
                <Lbl>Role</Lbl>
                <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:6 }}>
                  {Object.entries(ROLES).map(([k,r])=>{
                    const active=form.role===k;
                    return <button key={k} onClick={()=>sf("role",k)} style={{ padding:"8px 10px",borderRadius:8,cursor:"pointer",textAlign:"left",fontFamily:FONT,border:`1.5px solid ${active?r.color+"60":T.border}`,background:active?r.lo:T.surfaceHi,transition:"all .15s" }}>
                      <div style={{ fontSize:11,fontWeight:700,color:active?r.color:T.textPri }}>{r.label}</div>
                      <div style={{ fontSize:10,color:T.textMute,marginTop:1 }}>{r.team==="all"?"All Teams":r.team==="presales"?"Pre-Sales":"Delivery"}</div>
                    </button>;
                  })}
                </div>
              </div>
              {/* Supervisor field — hanya untuk SE, PM, dan Sales Engineer */}
              {["delivery","pm","presales"].includes(form.role) && (
                <div>
                  <Lbl>Atasan Langsung <span style={{ color:T.red }}>*</span></Lbl>
                  <select value={form.supervisorId||""} onChange={e=>sf("supervisorId",e.target.value?Number(e.target.value):null)}
                    style={{ width:"100%",background:T.surfaceHi,border:`1.5px solid ${errs.supervisorId?T.red:T.border}`,borderRadius:8,padding:"8px 12px",color:form.supervisorId?T.textPri:T.textMute,fontSize:12,outline:"none",fontFamily:FONT }}>
                    <option value="">-- Pilih atasan langsung --</option>
                    {(members||[]).filter(m=>["mgr_dl","mgr_ps"].includes(m.role)&&m.status==="active").map(m=>(
                      <option key={m.id} value={m.id}>{m.name} ({ROLES[m.role]?.label})</option>
                    ))}
                  </select>
                  {errs.supervisorId&&<div style={{ fontSize:11,color:T.red,marginTop:3 }}>{errs.supervisorId}</div>}
                </div>
              )}
              <div style={{ display:"flex",gap:8,marginTop:4,paddingTop:12,borderTop:`1px solid ${T.border}` }}>
                <Btn v="ghost" style={{ flex:1,justifyContent:"center" }} onClick={close}>Batal</Btn>
                <Btn v="primary" style={{ flex:2,justifyContent:"center" }} onClick={()=>validateStep1()&&setStep(2)}>Lanjut → SMTP</Btn>
              </div>
            </div>
          )}

          {/* Step 2 */}
          {step===2 && (
            <div style={{ display:"flex",flexDirection:"column",gap:12 }}>
              <div>
                <Lbl>Email Provider</Lbl>
                <div style={{ display:"flex",gap:5,flexWrap:"wrap" }}>
                  {SMTP_PROVS.map(p=>{
                    const active=smtp.provider===p.id;
                    return <button key={p.id} onClick={()=>setS(s=>({...s,provider:p.id,host:p.host,port:p.port}))} style={{ padding:"4px 12px",borderRadius:20,cursor:"pointer",fontFamily:FONT,fontSize:12,border:`1.5px solid ${active?T.indigo:T.border}`,background:active?T.indigoLo:T.surfaceHi,color:active?T.indigoHi:T.textSec,fontWeight:active?700:400 }}>{p.label}</button>;
                  })}
                </div>
              </div>
              <div style={{ display:"grid",gridTemplateColumns:"1fr 80px",gap:8 }}>
                <Inp label="SMTP Host" value={smtp.host} error={errs.host} readOnly={smtp.provider!=="custom"} onChange={e=>setS(s=>({...s,host:e.target.value}))} />
                <Inp label="Port" value={smtp.port} onChange={e=>setS(s=>({...s,port:e.target.value}))} />
              </div>
              <Inp label="Username / Email Pengirim" required value={smtp.user} error={errs.user} onChange={e=>{setS(s=>({...s,user:e.target.value}));setE(p=>({...p,user:""}));}} />
              <PwInp label="Password / API Key" value={smtp.pass} error={errs.pass} onChange={e=>{setS(s=>({...s,pass:e.target.value}));setE(p=>({...p,pass:""}));}} />
              <div style={{ background:T.amberLo,border:`1px solid ${T.amber}30`,borderRadius:7,padding:"7px 11px",fontSize:11,color:T.amber }}>⚠ Kredensial hanya disimpan di .env server, tidak dikirim ke frontend.</div>
              <div style={{ display:"flex",gap:8,paddingTop:8,borderTop:`1px solid ${T.border}` }}>
                <Btn v="ghost" style={{ flex:1,justifyContent:"center" }} onClick={()=>setStep(1)}>← Kembali</Btn>
                <Btn v="primary" style={{ flex:2,justifyContent:"center" }} onClick={()=>validateStep2()&&setStep(3)}>Preview →</Btn>
              </div>
            </div>
          )}

          {/* Step 3 */}
          {step===3 && (
            <div style={{ display:"flex",flexDirection:"column",gap:12 }}>
              <div style={{ background:T.surfaceHi,border:`1px solid ${T.border}`,borderRadius:8,padding:14 }}>
                {[["FROM",smtp.user],["TO",`${form.name} <${form.email}>`],["SUBJECT","Undangan bergabung ke EngineerLog"]].map(([k,v])=>(
                  <div key={k} style={{ fontSize:11,color:T.textMute,fontFamily:MONO,marginBottom:2 }}>{k}: <span style={{ color:T.textPri }}>{v}</span></div>
                ))}
                <div style={{ borderTop:`1px solid ${T.border}`,marginTop:10,paddingTop:10,fontSize:13,color:T.textSec,lineHeight:1.7 }}>
                  Halo <strong style={{ color:T.textPri }}>{form.name}</strong>, kamu diundang sebagai{" "}
                  <span style={{ color:rc?.color,fontWeight:700 }}>{rc?.label}</span> di EngineerLog — Seraphim Digital Technology.
                  <div style={{ margin:"12px 0",textAlign:"center" }}>
                    <span style={{ padding:"9px 20px",background:`linear-gradient(135deg,${T.indigo},${T.indigoHi})`,borderRadius:7,color:"#fff",fontWeight:700,fontSize:13,boxShadow:`0 4px 14px ${T.indigo}50` }}>Aktivasi Akun →</span>
                  </div>
                  <div style={{ fontSize:11,color:T.textMute }}>Link berlaku 24 jam.</div>
                </div>
              </div>
              <div style={{ display:"flex",gap:8,paddingTop:8,borderTop:`1px solid ${T.border}` }}>
                <Btn v="ghost" style={{ flex:1,justifyContent:"center" }} onClick={()=>setStep(2)}>← Kembali</Btn>
                <Btn v="teal" style={{ flex:2,justifyContent:"center",opacity:busy?.65:1 }} onClick={send} disabled={busy}>{busy?"Mengirim...":"✉ Kirim Undangan"}</Btn>
              </div>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}

function MemberCard({ m, canManage, canSeeKPI, onToggle, onDelete, activities }) {
  const [confirm,setC]=useState(false),[delC,setD]=useState(false);
  const kpi = useMemo(()=>calcKPI(m,activities),[m,activities]);
  const isSusp = m.status==="suspended";
  return (
    <Card style={{ opacity:isSusp?.75:1,position:"relative",overflow:"hidden" }} glow={isSusp?T.amber:undefined}>
      {isSusp&&<div style={{ position:"absolute",top:0,left:0,right:0,height:2,background:`repeating-linear-gradient(90deg,${T.amber} 0,${T.amber} 7px,transparent 7px,transparent 14px)` }} />}
      <div style={{ display:"flex",alignItems:"flex-start",gap:10,marginBottom:12 }}>
        <div style={{ position:"relative" }}>
          <Avi av={m.avatar} team={m.team} sz={40} />
          {m.status==="active"&&<div style={{ position:"absolute",bottom:1,right:1,width:8,height:8,borderRadius:"50%",background:T.green,border:`2px solid ${T.surface}` }} />}
        </div>
        <div style={{ flex:1,minWidth:0 }}>
          <div style={{ fontSize:13,fontWeight:700,color:isSusp?T.textMute:T.textPri }}>{m.name}</div>
          <div style={{ fontSize:11,color:T.textMute,marginBottom:5,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{m.email}</div>
          <div style={{ display:"flex",gap:4,flexWrap:"wrap" }}><RoleBadge role={m.role} /></div>
        </div>
        {canManage&&!delC&&<button onClick={()=>setD(true)} style={{ width:24,height:24,borderRadius:5,border:`1px solid ${T.red}30`,background:T.redLo,color:T.red,cursor:"pointer",fontSize:12,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}>🗑</button>}
      </div>

      {canSeeKPI && kpi && kpi.final!==null && (
        <div style={{ display:"flex",alignItems:"center",gap:8,padding:"7px 10px",background:T.surfaceHi,border:`1px solid ${T.border}`,borderRadius:8,marginBottom:10 }}>
          <ScoreRing score={kpi.final} size={34} />
          <div style={{ flex:1 }}>
            <div style={{ fontSize:10,color:T.textMute,marginBottom:2 }}>KPI Score</div>
            <div style={{ fontSize:11,fontWeight:700,color:kpiColor(kpi.final) }}>{KPI.label(kpi.final)}</div>
          </div>
          {KPI.eligible(kpi.final)&&<Tag color={T.green} lo={T.greenLo} small>QB ✓</Tag>}
        </div>
      )}

      {m.status==="invited"&&<div style={{ fontSize:11,color:T.jira,background:T.jiraLo,border:`1px solid ${T.jira}25`,borderRadius:6,padding:"6px 9px",marginBottom:8 }}>🔗 Undangan terkirim · 24 jam</div>}

      {canManage&&delC&&(
        <div style={{ background:T.redLo,border:`1px solid ${T.red}30`,borderRadius:7,padding:"10px 12px",marginBottom:8 }}>
          <div style={{ fontSize:12,fontWeight:700,color:T.red,marginBottom:3 }}>Hapus permanen?</div>
          <div style={{ fontSize:11,color:T.textSec,marginBottom:8 }}>Data {m.name} tidak bisa dikembalikan.</div>
          <div style={{ display:"flex",gap:5 }}><Btn v="ghost" sz="sm" style={{ flex:1,justifyContent:"center" }} onClick={()=>setD(false)}>Batal</Btn><Btn v="danger" sz="sm" style={{ flex:1,justifyContent:"center" }} onClick={()=>onDelete(m.id)}>Hapus</Btn></div>
        </div>
      )}

      {canManage&&m.status!=="invited"&&!delC&&(
        <div style={{ borderTop:`1px solid ${T.border}`,paddingTop:10 }}>
          {!confirm ? (
            <Btn v={isSusp?"green":"amber"} sz="sm" style={{ width:"100%",justifyContent:"center" }} onClick={()=>setC(true)}>{isSusp?"🔓 Aktifkan":"🔒 Suspend"}</Btn>
          ) : (
            <div>
              <div style={{ fontSize:11,color:T.textSec,marginBottom:6,textAlign:"center" }}>{isSusp?"Aktifkan akun ini?":"Suspend akun ini?"}</div>
              <div style={{ display:"flex",gap:5 }}><Btn v="ghost" sz="sm" style={{ flex:1,justifyContent:"center" }} onClick={()=>setC(false)}>Batal</Btn><Btn v={isSusp?"green":"amber"} sz="sm" style={{ flex:1,justifyContent:"center" }} onClick={()=>{onToggle(m.id);setC(false);}}>Ya</Btn></div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function kpiColor(score) {
  if (score == null) return T.textMute;
  if (score === -1) return T.red;
  if (score >= 3.5) return T.green;
  if (score >= 3) return T.teal;
  if (score >= 2) return T.amber;
  return T.red;
}

export function MembersView({ currentUser, members, onToggle, onDelete, onAdd, activities }) {
  const [teamF,setTF]=useState("all");
  const [inviteOpen,setInvite]=useState(false);
  const canManage = isAdmin(currentUser.role);
  
  const visBase = isAdmin(currentUser.role)
    ? members
    : members.filter(m=>m.supervisorId===currentUser.id||m.id===currentUser.id||["admin","mgr_dl","mgr_ps"].includes(m.role));
  const filtered  = teamF==="all"?visBase:visBase.filter(m=>m.team===teamF);

  const pmMembers      = filtered.filter(m=>m.role==="pm");
  const dlSEMembers    = filtered.filter(m=>m.team==="delivery" && m.role!=="pm" && m.role!=="mgr_dl");
  const dlMgrMembers   = filtered.filter(m=>m.role==="mgr_dl");
  const psMembers      = filtered.filter(m=>m.team==="presales" && m.role!=="mgr_ps");
  const psMgrMembers   = filtered.filter(m=>m.role==="mgr_ps");

  const Section = ({ label, color, members: list }) => {
    if(!list.length) return null;
    return (
      <div style={{ marginBottom:22 }}>
        <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:12 }}>
          <span style={{ fontSize:11,fontWeight:700,color,textTransform:"uppercase",letterSpacing:".07em" }}>{label}</span>
          <span style={{ fontSize:11,color:T.textMute }}>{list.length} member</span>
          <div style={{ flex:1,height:1,background:T.border }} />
        </div>
        <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(265px,1fr))",gap:10 }}>
          {list.map(m=><MemberCard key={m.id} m={m} canManage={canManage} canSeeKPI={isMgr(currentUser.role)} onToggle={onToggle} onDelete={onDelete} activities={activities} />)}
        </div>
      </div>
    );
  };

  const showDelivery = teamF==="all"||teamF==="delivery";
  const showPS       = teamF==="all"||teamF==="presales";

  return (
    <div>
      <div style={{ display:"flex",gap:5,marginBottom:18,flexWrap:"wrap",alignItems:"center" }}>
        {[["all","Semua Tim",T.indigoHi,T.indigoLo],["presales","Pre-Sales",T.violet,T.violetLo],["delivery","Delivery",T.teal,T.tealLo]].map(([v,l,col,lo])=>(
          <Pill key={v} active={teamF===v} color={col} lo={lo} onClick={()=>setTF(v)}>{l}</Pill>
        ))}
        <span style={{ fontSize:11,color:T.textMute,marginLeft:4 }}>
          {filtered.filter(m=>m.status==="active").length} aktif · {filtered.filter(m=>m.status==="suspended").length} suspended
        </span>
      </div>

      {showDelivery && <>
        <Section label="Project Manager" color={T.amber} members={pmMembers} />
        <Section label="Service Engineer" color={T.teal} members={dlSEMembers} />
        <Section label="Delivery Management" color={T.textSec} members={dlMgrMembers} />
      </>}
      {showPS && <>
        <Section label="Sales Engineer" color={T.violet} members={psMembers} />
        <Section label="Pre-Sales Management" color={T.textSec} members={psMgrMembers} />
      </>}

      {canManage && (
        <>
          <InviteModal open={inviteOpen} onClose={()=>setInvite(false)} members={members} onAdd={m=>{onAdd(m);setInvite(false);}} />
          <button onClick={()=>setInvite(true)}
            title="Undang Member Baru"
            style={{ position:"fixed",bottom:28,right:28,width:52,height:52,borderRadius:"50%",
              background:`linear-gradient(135deg,${T.indigo},${T.indigoHi})`,color:"#fff",border:"none",
              fontSize:22,cursor:"pointer",boxShadow:`0 4px 20px ${T.indigo}60`,display:"flex",
              alignItems:"center",justifyContent:"center",zIndex:100,transition:"transform .15s" }}
            onMouseEnter={e=>e.currentTarget.style.transform="scale(1.08)"}
            onMouseLeave={e=>e.currentTarget.style.transform="scale(1)"}>+</button>
        </>
      )}
    </div>
  );
}
