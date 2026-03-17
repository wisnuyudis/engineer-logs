import { useState } from 'react';
import { T, DISPLAY } from '../theme/tokens';
import { Card, Avi, RoleBadge, TeamBadge, Btn, Lbl, Inp } from './ui/Primitives';
import { PersonalKPI } from './shared/PersonalKPI';

export function ProfileView({ user, activities, onUpdate }) {
  const [edit,setE]=useState(false);
  const [draft,setD]=useState({...user});
  const [saved,setSaved]=useState(false);
  const save=()=>{onUpdate(draft);setE(false);setSaved(true);setTimeout(()=>setSaved(false),2500);};
  return (
    <div style={{ maxWidth:640 }}>
      <Card p={22} style={{ marginBottom:14 }}>
        <div style={{ display:"flex",alignItems:"flex-start",gap:14,marginBottom:18 }}>
          <Avi av={user.avatar} team={user.team} sz={60} />
          <div style={{ flex:1 }}>
            <div style={{ fontSize:18,fontWeight:800,color:T.textPri,fontFamily:DISPLAY }}>{user.name}</div>
            <div style={{ fontSize:12,color:T.textMute,marginTop:2 }}>{user.email}</div>
            <div style={{ display:"flex",gap:6,marginTop:7,flexWrap:"wrap" }}>
              <RoleBadge role={user.role} />
              <TeamBadge team={user.team} />
            </div>
          </div>
          <div>
            {!edit ? <Btn v="sec" sz="sm" onClick={()=>setE(true)}>✏ Edit</Btn>
            : <div style={{ display:"flex",gap:5 }}><Btn v="ghost" sz="sm" onClick={()=>{setE(false);setD({...user});}}>Batal</Btn><Btn v="teal" sz="sm" onClick={save}>Simpan</Btn></div>}
          </div>
        </div>
        {saved&&<div style={{ marginBottom:12,padding:"7px 12px",background:T.greenLo,border:`1px solid ${T.green}30`,borderRadius:7,fontSize:12,color:T.green }}>✓ Profil berhasil diperbarui</div>}
        <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12 }}>
          {[{k:"name",l:"Nama",e:true},{k:"email",l:"Email",e:false},{k:"position",l:"Jabatan",e:true},{k:"dept",l:"Departemen",e:true}].map(f=>(
            <div key={f.k}>
              <Lbl>{f.l}</Lbl>
              {edit&&f.e ? <Inp value={draft[f.k]||""} onChange={e=>setD(p=>({...p,[f.k]:e.target.value}))} />
              : <div style={{ fontSize:13,color:f.e?T.textPri:T.textMute,padding:"8px 0" }}>{user[f.k]||<span style={{ color:T.textMute,fontStyle:"italic" }}>Belum diisi</span>}</div>}
            </div>
          ))}
        </div>
      </Card>
      <PersonalKPI user={user} activities={activities} />
    </div>
  );
}
