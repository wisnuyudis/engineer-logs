import { useEffect, useState, useMemo, useRef } from 'react';
import { useTaxonomy } from '../contexts/TaxonomyContext';
import { T, FONT, MONO } from '../theme/tokens';
import { teamOf, actsFor, PS_STAGES } from '../constants/taxonomy';
import { Btn, Lbl, Inp } from './ui/Primitives';
import { toast } from 'sonner';
import api from '../lib/api';

export function LogForm({ user, onSave, onCancel }) {
  const ACTS = useTaxonomy();
  const myTeam = teamOf(user.role);
  const availActs = useMemo(
    () => Object.fromEntries(Object.entries(actsFor(user.role, ACTS)).filter(([, value]) => value.source !== "jira")),
    [user.role, ACTS]
  );
  const firstActKey = Object.keys(availActs)[0] || "";
  const [actKey, setActKey] = useState(Object.keys(availActs)[0] || "");
  const [startTime, setStart] = useState("09:00");
  const [endTime,   setEnd]   = useState("10:00");
  const [date,      setDate]  = useState(() => new Date().toISOString().split("T")[0]);
  const [status, setStatus] = useState("completed");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState({});
  const [customerName, setCustomer] = useState("");
  // PM Presentation NPS
  const [pmNps, setPmNps] = useState(3);
  // App-only fields
  const [topic, setTopic] = useState("");
  const [contact, setContact] = useState("");
  // Pre-sales fields
  const [prName, setPrName] = useState("");
  const [prId, setPrId]     = useState("");
  const [value, setValue]   = useState("");
  const [stage, setStage]   = useState("Contacted");
  // Attachments
  const [files, setFiles]   = useState([]);
  const [dragOver, setDrag] = useState(false);
  const fileRef = useRef(null);

  const def = availActs[actKey] || {};
  const isPS   = def.team === "presales" && def.source === "app";
  const needsCustomer   = ["pm_presentation"].includes(actKey);
  const needsPmNps      = actKey === "pm_presentation";
  const needsContact    = actKey === "koordinasi";
  const needsTopic      = def.source === "app" && !isPS && !needsContact;

  const todayStr = new Date().toLocaleDateString("id-ID",{weekday:"long",day:"numeric",month:"long",year:"numeric"});

  useEffect(() => {
    if (!actKey && firstActKey) setActKey(firstActKey);
  }, [actKey, firstActKey]);

  // Compute duration in minutes from time range
  const calcDur = (s, e) => {
    const [sh,sm]=s.split(":").map(Number), [eh,em]=e.split(":").map(Number);
    const d = (eh*60+em)-(sh*60+sm);
    return d > 0 ? d : 0;
  };
  const dur = calcDur(startTime, endTime);
  const durLabel = dur > 0 ? `${Math.floor(dur/60)}j ${dur%60>0?dur%60+"m":""}`.trim() : "—";

  // File handling
  const ALLOWED = ["application/pdf","image/png","image/jpeg","application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
  const EXT_MAP  = {
    "application/pdf":"PDF","image/png":"PNG","image/jpeg":"JPG",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document":"DOCX"
  };
  const addFiles = (raw) => {
    const valid=[], errsLocal=[];
    Array.from(raw).forEach(f=>{
      if(!ALLOWED.includes(f.type)) return errsLocal.push(`${f.name}: format tidak didukung`);
      if(f.size>20*1024*1024)       return errsLocal.push(`${f.name}: maks 20 MB`);
      valid.push({ name:f.name, size:f.size, type:f.type, ext:EXT_MAP[f.type]||"FILE", id:Date.now()+Math.random(), file: f });
    });
    setFiles(p=>[...p,...valid]);
    if(errsLocal.length) setErr(p=>({...p,files:errsLocal.join(" · ")}));
  };

  const save = async () => {
    const e = {};
    const selectedActKey = actKey || firstActKey;
    if(dur<=0) e.time="Jam selesai harus setelah jam mulai";
    if(!selectedActKey) e.actKey="Jenis aktivitas wajib";
    if(needsCustomer && !customerName.trim()) e.customerName="Nama Customer wajib";
    if(needsPmNps && (pmNps<0||pmNps>4)) e.pmNps="NPS harus 0-4";
    if(isPS && !prId.trim()) e.prId="Prospect ID wajib";
    setErr(e);
    if(Object.keys(e).length) return;

    setBusy(true);
    try {
      // 1. Create main activity record
      const payload = {
        actKey: selectedActKey,
        date: date || new Date().toISOString().slice(0, 10),
        startTime: startTime || null,
        endTime: endTime || null,
        dur,
        status: status || "completed",
        note: note || "",
        ...(needsCustomer ? { customerName: customerName.trim() } : {}),
        ...(needsPmNps ? { nps: pmNps } : {}),
        ...(needsTopic ? { topic } : {}),
        ...(needsContact ? { topic: contact } : {}), // Map contact to topic for simplicity
        ...(isPS ? { prName, leadId: prId, prospectValue: Number(value)||0 } : {}) // Note: backend schema mapped prId to leadId
      };
      
      const { data: activity } = await api.post('/activities', payload);
      
      // 2. Upload files if any
      const uploadedAttachments = [];
      if (files.length > 0) {
        for (const f of files) {
          const formData = new FormData();
          formData.append('file', f.file);
          const { data: attach } = await api.post(`/activities/${activity.id}/attachments`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
          });
          uploadedAttachments.push(attach);
        }
      }

      // Add actual nested user logic for UI mock compat and the newly created attachments
      activity.user = user.name; 
      activity.userTeam = teamOf(user.role);
      activity.attachments = uploadedAttachments;
      
      toast.success("Aktivitas berhasil ditambahkan");
      onSave(activity);
    } catch (error) {
      toast.error(error.response?.data?.error || "Gagal menyimpan aktivitas");
    } finally {
      setBusy(false);
    }
  };

  const appGroup  = Object.entries(availActs).filter(([,v])=>v.source==="app");

  return (
    <div style={{ display:"flex",flexDirection:"column",gap:16 }}>
      <div style={{ fontSize:11,color:T.textMute,borderBottom:`1px solid ${T.border}`,paddingBottom:12 }}>{todayStr}</div>

      {/* Activity type picker */}
      <div>
        <Lbl>Jenis Aktivitas</Lbl>
        {appGroup.length > 0 && (
          <div>
            <div style={{ display:"flex",alignItems:"center",gap:6,marginBottom:6 }}>
              <div style={{ width:10,height:10,borderRadius:2,background:T.textMute }} />
              <span style={{ fontSize:10,color:T.textMute,fontWeight:700,letterSpacing:".05em" }}>INPUT MANUAL</span>
            </div>
            <div style={{ display:"flex",flexWrap:"wrap",gap:5 }}>
              {appGroup.map(([k,v]) => (
                <button key={k} onClick={()=>setActKey(k)} style={{ padding:"5px 12px",borderRadius:8,cursor:"pointer",fontFamily:FONT,fontSize:12,fontWeight:actKey===k?700:400,
                  border:`1.5px solid ${actKey===k?v.color:T.border}`,
                  background:actKey===k?v.colorLo:T.surfaceHi,color:actKey===k?v.color:T.textSec,transition:"all .15s",display:"flex",alignItems:"center",gap:5 }}>
                  <span>{v.icon}</span>{v.label}
                </button>
              ))}
            </div>
          </div>
        )}
        {def.desc && <div style={{ marginTop:7,fontSize:11,color:T.textMute,background:T.surfaceHi,border:`1px solid ${T.border}`,borderRadius:6,padding:"5px 10px" }}>ℹ {def.desc}</div>}
      </div>

      {needsCustomer && (
        <Inp label="Nama Customer / Klien" required value={customerName} error={err.customerName}
          placeholder="PT. Tokobagus, PT. BRI..." onChange={e=>{setCustomer(e.target.value);setErr(p=>({...p,customerName:""}));}} />
      )}
      {needsPmNps && (
        <div style={{ background:T.surfaceHi,border:`1.5px solid ${T.border}`,borderRadius:10,padding:"14px 16px" }}>
          <Lbl>Skor NPS Customer (0–4) <span style={{ color:T.red }}>*</span></Lbl>
          <div style={{ display:"flex",gap:6,marginTop:6 }}>
            {[0,1,2,3,4].map(n=>(
              <button key={n} type="button" onClick={()=>setPmNps(n)}
                style={{ flex:1,padding:"9px 0",borderRadius:8,border:`2px solid ${pmNps===n?T.indigo:T.border}`,
                  cursor:"pointer",fontFamily:MONO,fontSize:16,fontWeight:700,
                  background:pmNps===n?T.indigoLo:T.surfaceHi,
                  color:pmNps===n?T.indigoHi:T.textMute,transition:"all .15s" }}>
                {n}
              </button>
            ))}
          </div>
          <div style={{ fontSize:10,color:T.textMute,marginTop:5 }}>
            {pmNps===4?"😄 Sangat Puas":pmNps===3?"🙂 Puas":pmNps===2?"😐 Cukup":pmNps===1?"😕 Kurang":"😞 Sangat Kurang"}
          </div>
          {err.pmNps&&<div style={{ fontSize:11,color:T.red,marginTop:3 }}>{err.pmNps}</div>}
        </div>
      )}

      {/* Pre-sales fields */}
      {isPS && (
        <div style={{ background:T.violetLo,border:`1.5px solid ${T.violet}30`,borderRadius:10,padding:"14px 16px" }}>
          <div style={{ fontSize:11,fontWeight:700,color:T.violet,letterSpacing:".04em",marginBottom:12 }}>🎯 INFO PROSPECT / LEAD</div>
          <div style={{ display:"grid",gridTemplateColumns:"1fr 130px",gap:10,marginBottom:10 }}>
            <Inp label="Nama Prospect" value={prName} placeholder="PT. Contoh Jaya" onChange={e=>setPrName(e.target.value)} />
            <Inp label="Lead ID" required mono value={prId} error={err.prId} placeholder="LEAD-XXX" onChange={e=>{setPrId(e.target.value);setErr(p=>({...p,prId:""}));}} />
          </div>
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10 }}>
            <Inp label="Estimasi Nilai (Rp)" type="number" value={value} placeholder="1000000000" onChange={e=>setValue(e.target.value)} />
            <div>
              <Lbl>Stage</Lbl>
              <select value={stage} onChange={e=>setStage(e.target.value)} style={{ width:"100%",background:T.surfaceHi,border:`1.5px solid ${T.border}`,borderRadius:8,padding:"8px 12px",color:T.textPri,fontSize:13,outline:"none",fontFamily:FONT }}>
                {PS_STAGES.map(s=><option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Topic for generic app activities */}
      {needsTopic && (
        <Inp label="Topik / Judul Aktivitas" required value={topic} error={err.topic} placeholder="Deskripsi aktivitas..." onChange={e=>{setTopic(e.target.value);setErr(p=>({...p,topic:""}));}} />
      )}
      {needsContact && (
        <Inp label="Kontak / Klien" value={contact} placeholder="PT. BRI – Pak Hendro IT" onChange={e=>setContact(e.target.value)} />
      )}

      {/* Time range + Status */}
      <div>
        <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:8 }}>
          <div>
            <Lbl required>Tanggal</Lbl>
            <input type="date" value={date} onChange={e=>setDate(e.target.value)}
              style={{ width:"100%",background:T.surfaceHi,border:`1.5px solid ${T.border}`,borderRadius:8,padding:"8px 10px",color:T.textPri,fontSize:14,outline:"none",boxSizing:"border-box",fontFamily:MONO,colorScheme:"dark" }} />
          </div>
          <div>
            <Lbl required>Jam Mulai</Lbl>
            <input type="time" value={startTime} onChange={e=>{setStart(e.target.value);setErr(p=>({...p,time:""}));}}
              style={{ width:"100%",background:T.surfaceHi,border:`1.5px solid ${err.time?T.red:T.border}`,borderRadius:8,padding:"8px 10px",color:T.textPri,fontSize:14,outline:"none",boxSizing:"border-box",fontFamily:MONO,colorScheme:"dark" }} />
          </div>
          <div>
            <Lbl required>Jam Selesai</Lbl>
            <input type="time" value={endTime} onChange={e=>{setEnd(e.target.value);setErr(p=>({...p,time:""}));}}
              style={{ width:"100%",background:T.surfaceHi,border:`1.5px solid ${err.time?T.red:T.border}`,borderRadius:8,padding:"8px 10px",color:T.textPri,fontSize:14,outline:"none",boxSizing:"border-box",fontFamily:MONO,colorScheme:"dark" }} />
          </div>
        </div>
        <div style={{ marginBottom:8 }}>
          <Lbl>Durasi</Lbl>
          <div style={{ height:37,display:"flex",alignItems:"center",padding:"0 12px",background:dur>0?T.indigoLo:T.surfaceHi,border:`1.5px solid ${dur>0?T.indigo+"50":T.border}`,borderRadius:8 }}>
            <span style={{ fontSize:15,fontWeight:800,color:dur>0?T.indigoHi:T.textMute,fontFamily:MONO }}>{durLabel}</span>
          </div>
        </div>
        {err.time && <div style={{ fontSize:10,color:T.red,marginTop:2 }}>⚠ {err.time}</div>}

        <div style={{ marginTop:10 }}>
          <Lbl>Status</Lbl>
          <div style={{ display:"flex",gap:6,height:35 }}>
            {[["completed","✓ Selesai",T.green,T.greenLo],["in_progress","⏳ In Progress",T.amber,T.amberLo]].map(([v,l,col,lo])=>(
              <button key={v} onClick={()=>setStatus(v)} style={{ flex:1,borderRadius:8,cursor:"pointer",fontFamily:FONT,fontSize:12,fontWeight:status===v?700:400,
                border:`1.5px solid ${status===v?col:T.border}`,background:status===v?lo:T.surfaceHi,color:status===v?col:T.textSec,transition:"all .15s" }}>
                {l}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div>
        <Lbl>Catatan</Lbl>
        <textarea value={note} onChange={e=>setNote(e.target.value)} rows={2} placeholder="Progress, hambatan, catatan penting..."
          style={{ width:"100%",background:T.surfaceHi,border:`1.5px solid ${T.border}`,borderRadius:8,padding:"8px 12px",color:T.textPri,fontSize:13,outline:"none",boxSizing:"border-box",fontFamily:FONT,resize:"vertical",lineHeight:1.6 }}
          onFocus={e=>e.target.style.borderColor=T.indigo} onBlur={e=>e.target.style.borderColor=T.border} />
      </div>

      {/* Attachment */}
      <div>
        <Lbl>Lampiran <span style={{ fontWeight:400,textTransform:"none",letterSpacing:0 }}>(PDF, PNG, JPG, DOCX · maks 20 MB)</span></Lbl>
        <input ref={fileRef} type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.docx" style={{ display:"none" }} onChange={e=>addFiles(e.target.files)} />
        <div
          onClick={()=>fileRef.current.click()}
          onDragOver={e=>{e.preventDefault();setDrag(true);}}
          onDragLeave={()=>setDrag(false)}
          onDrop={e=>{e.preventDefault();setDrag(false);addFiles(e.dataTransfer.files);}}
          style={{ border:`2px dashed ${dragOver?T.indigo:T.border}`,borderRadius:9,padding:"14px 16px",cursor:"pointer",
            background:dragOver?T.indigoLo:T.surfaceHi,transition:"all .15s",textAlign:"center" }}>
          <div style={{ fontSize:20,marginBottom:4 }}>📎</div>
          <div style={{ fontSize:12,color:dragOver?T.indigoHi:T.textSec }}>Klik atau drag & drop file di sini</div>
        </div>
        {err.files && <div style={{ fontSize:10,color:T.red,marginTop:3 }}>⚠ {err.files}</div>}
        {files.length>0 && (
          <div style={{ display:"flex",flexDirection:"column",gap:4,marginTop:8 }}>
            {files.map(f=>(
              <div key={f.id} style={{ display:"flex",alignItems:"center",gap:8,padding:"6px 10px",background:T.surfaceHi,border:`1px solid ${T.border}`,borderRadius:7 }}>
                <span style={{ fontSize:10,fontWeight:700,color:T.indigoHi,background:T.indigoLo,padding:"2px 6px",borderRadius:4,fontFamily:MONO,flexShrink:0 }}>{f.ext}</span>
                <span style={{ fontSize:12,color:T.textPri,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{f.name}</span>
                <span style={{ fontSize:10,color:T.textMute,flexShrink:0 }}>{(f.size/1024/1024).toFixed(1)} MB</span>
                <button onClick={e=>{e.stopPropagation();setFiles(p=>p.filter(x=>x.id!==f.id));}} style={{ background:"none",border:"none",color:T.red,cursor:"pointer",fontSize:14,padding:0,flexShrink:0 }}>×</button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ display:"flex",gap:8,paddingTop:4,borderTop:`1px solid ${T.border}` }}>
        <Btn v="ghost" style={{ flex:1,justifyContent:"center" }} onClick={onCancel} disabled={busy}>Batal</Btn>
        <Btn v="primary" style={{ flex:2,justifyContent:"center" }} onClick={save} disabled={busy}>
          {busy ? "Menyimpan..." : "+ Log Aktivitas"}
        </Btn>
      </div>
    </div>
  );
}
