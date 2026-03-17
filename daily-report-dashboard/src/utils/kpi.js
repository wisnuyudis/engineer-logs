import { T } from '../theme/tokens';
import { isPM } from '../constants/taxonomy';

// PD-001 KPI scoring helpers — sesuai dokumen resmi
export const KPI = {
  label: s => s==null?"N/A":s===-1?"Pelanggaran":s>=3.5?"Sangat Baik":s>=3?"Baik":s>=2?"Cukup":s>=1?"Kurang":"Tidak Memenuhi",
  color: s => s==null?T.textMute:s===-1?T.red:s>=3.5?T.green:s>=3?T.teal:s>=2?T.amber:T.red,
  eligible: s => s!=null && s!==-1 && s>=3.0,

  // Implementasi
  seImplTask: p => p>=90?4:p>=75?3:p>=50?2:p>=25?1:0,
  // Dokumentasi: l=jumlah doc terlambat, c=true jika doc kritikal (MoP/RC) missing
  seImplDoc: (l,c) => c?0:l===0?4:l===1?3:l<=3?2:l>3?1:0,

  // Preventive Maintenance
  // sEnd = akhir rentang tanggal (date string); act = tanggal aktual pelaksanaan
  sePMExec: (sEnd, act) => {
    if(!act) return -1;
    const diff = Math.round((new Date(act) - new Date(sEnd)) / 864e5);
    if(diff <= 0) return 4;       // dalam rentang
    if(diff <= 7) return 3;       // ≤ 1 minggu setelah
    if(diff <= 14) return 2;      // > 1–2 minggu
    if(diff <= 28) return 1;      // > 2–4 minggu
    return 0;                     // > 4 minggu
  },
  // reportDays = hari kerja setelah tanggal aktual PM
  sePMRep: d => d==null?-1:d<=3?4:d<=5?3:d<=10?2:d<=15?1:0,

  // Corrective Maintenance — Response (SLA 15 menit utk semua severity)
  // m = menit aktual response
  seCMResp: m => m==null?-1:m===0?0:m<=15?4:m<=30?3:m<=45?2:m>45?1:-1,

  // Resolution time — sla per severity (jam): T1=8, T2=16, T3/T4=48
  seCMRes: (h, sev) => {
    if(h==null) return -1;
    const sla = sev===1?8:sev===2?16:48;
    if(h===0) return 0;   // direspon tanpa tindak lanjut
    if(h<=sla) return 4;
    if(h<=sla*2) return 3;
    if(h<=sla*3) return 2;
    return 1;
  },

  // Enhancement — SLA 1 hari kerja = 8 jam
  seEnh: h => h==null?-1:h===0?0:h<=8?4:h<=16?3:h<=24?2:1,

  // Operational Service
  // ml = hari terlambat monthly, ql = hari terlambat quarterly
  seOpsMonthly:   d => d==null?-1:d<=0?4:d<=7?3:d<=14?2:d<=28?1:0,
  seOpsQuarterly: d => d==null?-1:d<=0?4:d<=7?3:d<=14?2:d<=28?1:0,
  seOps: (ml, ql, nps) => {
    const scores = [];
    if(ml!=null) scores.push(ml<0?4:ml===0?4:ml<=7?3:ml<=14?2:ml<=28?1:0);
    if(ql!=null) scores.push(ql<0?4:ql===0?4:ql<=7?3:ql<=14?2:ql<=28?1:0);
    scores.push(nps??3);
    if(scores.some(s=>s===-1)) return -1;
    return scores.reduce((a,b)=>a+b,0)/scores.length;
  },

  // PD-002 Project Manager helpers
  // PD-002 Pasal 10.1: CD aktual vs rencana
  pmTL: (pl,ac) => { if(!pl||!ac) return null; const d=(ac-pl)/pl*100; return d<=10?4:d<=25?3:d<=50?2:d<=100?1:0; },
  // PD-002 Pasal 10.2: MD aktual vs rencana
  pmMD: (pl,ac) => { if(!pl||!ac) return null; const d=(ac-pl)/pl*100; return d<=10?4:d<=25?3:d<=50?2:d<=100?1:0; },
  pmBAST: (dl,ac) => { if(!ac) return -1; const diff=Math.round((new Date(ac)-new Date(dl))/864e5); return diff<=0?4:diff<=7?3:diff<=14?2:1; },
  pmGov: d => d==null?-1:d<0?4:d===0?4:d<=7?3:d<=14?2:d<=28?1:0,
  // Admin/docs PD-002 Pasal 10.3: kritikal = SOW/BAST missing → 0
  pmAdmin: (l,c) => c?0:l===0?4:l===1?3:l<=3?2:l>3?1:0,
  // Ops NPS delivery PD-002 Pasal 16.2: opsNpsSent = days late
  pmOpsNps: d => d==null?-1:d<0?4:d===0?4:d<=7?3:d<=14?2:d<=28?1:0,
};

export function calcKPI(user, acts) {
  const my = acts.filter(a => a.user === user.name);
  const role = user.role;
  if (role !== "delivery" && role !== "pm") return null;

  if (isPM(role)) {
    // PD-002: 3 domain – Impl, PM (BAST), Ops (Governance + NPS)
    const impl = my.filter(a => a.actKey==="jira_impl" && a.kpi?.cdPlan!=null);
    const pm   = my.filter(a => a.actKey==="jira_pm"   && a.kpi?.bastDeadline);
    // Ops: govLateDays (monthly governance issues), opsNpsSent (days late NPS delivery)
    const ops  = my.filter(a => a.actKey==="jira_ops");
    const hasOps = ops.some(a => a.kpi?.govLateDays!=null || a.kpi?.opsNpsSent!=null);

    // Domain Implementasi: (TL + MD + Admin + NPS) / 4
    const iS = impl.length ? (() => {
      const scores = impl.map(a => {
        const tl  = KPI.pmTL(a.kpi.cdPlan, a.kpi.cdActual);
        const md  = KPI.pmMD(a.kpi.mdPlan, a.kpi.mdActual);
        const adm = KPI.pmAdmin(a.kpi.docsLate||0, a.kpi.critMissing||false);
        const nps = a.kpi.nps ?? 3;
        const parts = [tl,md,adm,nps].filter(x=>x!=null);
        return parts.reduce((a,b)=>a+b,0)/parts.length;
      });
      return scores.reduce((a,b)=>a+b,0)/scores.length;
    })() : null;

    // Domain PM: avg BAST scoring per aktivitas
    const pS = pm.length ? (() => {
      const scores = pm.map(a => KPI.pmBAST(a.kpi.bastDeadline, a.kpi.bastActual));
      if(scores.some(s=>s===-1)) return -1;
      return scores.reduce((a,b)=>a+b,0)/scores.length;
    })() : null;

    // Domain Ops: avg(governance scores + NPS jika applicable)
    const oS = hasOps ? (() => {
      const govScores = ops.filter(a=>a.kpi?.govLateDays!=null)
        .map(a=>KPI.pmGov(a.kpi.govLateDays));
      const npsScores = ops.filter(a=>a.kpi?.opsNpsSent!=null)
        .map(a=>KPI.pmOpsNps(a.kpi.opsNpsSent));
      const all = [...govScores, ...npsScores];
      if(!all.length) return null;
      if(all.some(s=>s===-1)) return -1;
      return all.reduce((a,b)=>a+b,0)/all.length;
    })() : null;

    const domains=[iS,pS,oS].filter(d=>d!=null);
    const final=domains.some(d=>d===-1)?-1:domains.length?domains.reduce((a,b)=>a+b,0)/domains.length:null;
    return { final, domains:[
      {label:"Implementasi",score:iS,count:impl.length},
      {label:"Preventive Maint.",score:pS,count:pm.length},
      {label:"Operational Svc",score:oS,count:ops.filter(a=>a.kpi?.govLateDays!=null||a.kpi?.opsNpsSent!=null).length},
    ]};
  } else {
    const impl = my.filter(a => a.actKey==="jira_impl" && a.kpi?.taskPct!=null);
    const pm   = my.filter(a => a.actKey==="jira_pm"   && a.kpi?.scheduledEnd);
    const cm   = my.filter(a => a.actKey==="jira_cm"   && a.kpi?.responseMin!=null);
    const enh  = my.filter(a => a.actKey==="jira_enh"  && a.kpi?.responseHours!=null);
    const ops  = my.filter(a => a.actKey==="jira_ops"  && a.kpi?.monthlyLateDays!=null);
    const iS = impl.length ? impl.map(a=>(KPI.seImplTask(a.kpi.taskPct)+KPI.seImplDoc(a.kpi.docsLate||0,a.kpi.critMissing||false)+(a.kpi.nps??3))/3).reduce((a,b)=>a+b,0)/impl.length : null;
    const pmPres = my.filter(a => a.actKey==="pm_presentation" && a.kpi?.nps!=null);
    const pmS = (() => {
      const execScores = pm.map(a=>{ const e=KPI.sePMExec(a.kpi.scheduledEnd,a.kpi.actualDate),r=KPI.sePMRep(a.kpi.reportDays); return (e===-1||r===-1)?-1:(e+r)/2; });
      const npsScores  = pmPres.map(a => a.kpi.nps);
      const all = [...execScores, ...npsScores];
      if(!all.length) return null;
      if(all.some(s=>s===-1)) return -1;
      return all.reduce((a,b)=>a+b,0)/all.length;
    })();
    const cmS= cm.length   ? cm.map(a=>{ const r=KPI.seCMResp(a.kpi.responseMin),s=KPI.seCMRes(a.kpi.resolutionHours,a.kpi.severity||2); return (r===-1||s===-1)?-1:(r+s)/2; }).reduce((a,b)=>a+b,0)/cm.length : null;
    const eS = enh.length  ? enh.map(a=>KPI.seEnh(a.kpi.responseHours)).reduce((a,b)=>a+b,0)/enh.length : null;
    const oS = ops.length  ? ops.map(a=>KPI.seOps(a.kpi.monthlyLateDays,a.kpi.quarterlyLateDays,a.kpi.nps??3)).reduce((a,b)=>a+b,0)/ops.length : null;
    const domains=[iS,pmS,cmS,eS,oS].filter(d=>d!=null);
    const final=domains.some(d=>d===-1)?-1:domains.length?domains.reduce((a,b)=>a+b,0)/domains.length:null;
    return { final, domains:[
      {label:"Implementation",score:iS,count:impl.length},
      {label:"Preventive Maint.",score:pmS,count:pm.length+pmPres.length},
      {label:"Corrective Maint.",score:cmS,count:cm.length},
      {label:"Enhancement",score:eS,count:enh.length},
      {label:"Operational Svc",score:oS,count:ops.length},
    ]};
  }
}
