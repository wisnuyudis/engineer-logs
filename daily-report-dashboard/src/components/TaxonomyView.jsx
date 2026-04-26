import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { T, FONT } from '../theme/tokens';
import { Card, Btn, Lbl, Inp, Modal, MHead } from './ui/Primitives';
import { isAdmin } from '../constants/taxonomy';
import api from '../lib/api';
import { toast } from 'sonner';

const INIT_FORM = {
  actKey: "", label: "", icon: "", color: "#4F46E5", colorLo: "#4F46E520",
  team: "all", source: "app", kpiDomain: "", desc: "", isActive: true
};

export function TaxonomyView({ currentUser }) {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [formData, setFormData] = useState(INIT_FORM);
  
  const { data: tax = [], isLoading } = useQuery({
    queryKey: ['taxonomy'],
    queryFn: async () => {
      const res = await api.get('/taxonomy');
      return res.data;
    }
  });

  const toggleMut = useMutation({
    mutationFn: async ({ id, isActive }) => {
      return api.put(`/taxonomy/${id}/toggle`, { isActive });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['taxonomy']);
      toast.success("Status tipe aktivitas diupdate");
    }
  });

  const saveMut = useMutation({
    mutationFn: async (payload) => {
      if (payload.id) return api.put(`/taxonomy/${payload.id}`, payload);
      return api.post(`/taxonomy`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['taxonomy']);
      toast.success("Master Data berhasil disimpan!");
      setModalOpen(false);
    },
    onError: (err) => {
      toast.error(err?.response?.data?.error || "Gagal menyimpan data");
    }
  });

  if (!isAdmin(currentUser.role)) {
    return <div style={{ color: T.red, padding: 20 }}>Akses Ditolak. Hanya untuk Admin.</div>;
  }

  const handleToggle = (id, currentStatus) => {
    toggleMut.mutate({ id, isActive: !currentStatus });
  };

  const openNew = () => {
    setFormData(INIT_FORM);
    setModalOpen(true);
  };

  const openEdit = (t) => {
    setFormData({ ...t });
    setModalOpen(true);
  };

  const handleChange = (e) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const onSubmit = (e) => {
    e.preventDefault();
    if (!formData.actKey || !formData.label) {
      toast.error("actKey dan Label wajib diisi!");
      return;
    }
    saveMut.mutate(formData);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <p style={{ color: T.textMute, fontSize: 13, marginBottom: 12 }}>
        Atur kategori pekerjaan yang dipakai aplikasi. Kategori sinkron otomatis tetap muncul di master, tetapi tidak dipilih manual dari web atau bot.
      </p>

      {isLoading ? (
        <div style={{ color: T.textMute, fontSize: 13 }}>Memuat data master...</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}>
          {/* Btn Add */}
          <Card onClick={openNew} p={16} style={{ border: `2px dashed ${T.border}`, background: "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", minHeight: 120 }}>
            <div style={{ textAlign: "center", color: T.indigo }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>+</div>
              <div style={{ fontSize: 13, fontWeight: 700 }}>Tambah Kategori Baru</div>
            </div>
          </Card>

          {tax.map(t => (
            <Card key={t.id} p={16} style={{ display:"flex", flexDirection:"column", opacity: t.isActive ? 1 : 0.6, transition: "all 0.2s" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: t.colorLo || T.surfaceHi, color: t.color || T.textPri, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>
                    {t.icon}
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: T.textPri }}>{t.label}</div>
                    <div style={{ fontSize: 11, color: T.textMute, fontFamily: FONT }}>{t.actKey}</div>
                  </div>
                </div>
                <div 
                  onClick={() => handleToggle(t.id, t.isActive)}
                  style={{ width: 44, height: 24, borderRadius: 12, background: t.isActive ? T.greenLo : T.surfaceHi, border: `1.5px solid ${t.isActive ? T.green : T.border}`, position: "relative", cursor: "pointer", transition: "all 0.2s" }}
                >
                  <div style={{ width: 16, height: 16, borderRadius: "50%", background: t.isActive ? T.green : T.textMute, position: "absolute", top: 2.5, left: t.isActive ? 22 : 3, transition: "all 0.2s" }} />
                </div>
              </div>
              
              <div style={{ fontSize: 11, color: T.textMute, lineHeight: 1.5, marginBottom: 12, flex: 1 }}>
                {t.desc || <span style={{ fontStyle: "italic" }}>Tidak ada penjelasan deskripsi.</span>}
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
                <div style={{ display: "flex", gap: 8, fontSize: 10, flexWrap: "wrap" }}>
                  <span style={{ padding: "3px 8px", background: T.surfaceHi, borderRadius: 4, color: T.textSec }}>
                    <strong style={{ color: t.source === 'jira' ? T.jira : T.textPri }}>{t.source === 'jira' ? 'SYNC' : 'MANUAL'}</strong>
                  </span>
                  <span style={{ padding: "3px 8px", background: T.surfaceHi, borderRadius: 4, color: T.textSec }}>
                    <strong>{t.team}</strong>
                  </span>
                </div>
                <Btn sz="sm" v="ghost" onClick={() => openEdit(t)}>Edit</Btn>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Editor Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} width={480}>
        <MHead title={formData.id ? "Edit Master Kategori" : "Tambah Master Kategori"} onClose={() => setModalOpen(false)} />
        <form onSubmit={onSubmit} style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", gap: 16 }}>
            <div style={{ flex: 1 }}>
              <Lbl>Kunci (actKey) unik</Lbl>
              <Inp name="actKey" disabled={!!formData.id} value={formData.actKey} onChange={handleChange} placeholder="Contoh: internal_meeting" />
            </div>
            <div style={{ flex: 1 }}>
              <Lbl>Label Form</Lbl>
              <Inp name="label" value={formData.label} onChange={handleChange} placeholder="Internal Meeting" />
            </div>
          </div>
          <div style={{ display: "flex", gap: 16 }}>
            <div style={{ width: 80 }}>
              <Lbl>Emoji</Lbl>
              <Inp name="icon" value={formData.icon} onChange={handleChange} placeholder="💡" />
            </div>
            <div style={{ flex: 1 }}>
              <Lbl>Warna Utama (HEX)</Lbl>
              <Inp name="color" value={formData.color} onChange={handleChange} placeholder="#4F46E5" />
            </div>
            <div style={{ flex: 1 }}>
              <Lbl>Warna Lemah (Opsional)</Lbl>
              <Inp name="colorLo" value={formData.colorLo} onChange={handleChange} placeholder="#4F46E520" />
            </div>
          </div>
          <div style={{ display: "flex", gap: 16 }}>
            <div style={{ flex: 1 }}>
              <Lbl>Divisi (Team)</Lbl>
              <select name="team" value={formData.team} onChange={handleChange} style={{ width: "100%", padding: "10px 14px", borderRadius: 8, background: T.surfaceHi, border: `1px solid ${T.border}`, color: T.textPri, outline: "none", fontSize: 13 }}>
                <option value="all">Semua Tim</option>
                <option value="delivery">Delivery Saja</option>
                <option value="presales">Pre-Sales Saja</option>
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <Lbl>Sumber Tugas</Lbl>
              <select name="source" value={formData.source} onChange={handleChange} style={{ width: "100%", padding: "10px 14px", borderRadius: 8, background: T.surfaceHi, border: `1px solid ${T.border}`, color: T.textPri, outline: "none", fontSize: 13 }}>
                <option value="app">Input Manual</option>
                <option value="jira">Sinkron Otomatis</option>
              </select>
            </div>
          </div>
          <div>
            <Lbl>Deskripsi Pekerjaan (Bantuan UI)</Lbl>
            <textarea
              name="desc" value={formData.desc} onChange={handleChange} rows={2}
              style={{ width: "100%", padding: "10px 14px", borderRadius: 8, background: T.surfaceHi, border: `1px solid ${T.border}`, color: T.textPri, outline: "none", fontSize: 13, resize: "none" }}
              placeholder="Deskripsi singkat jenis aktivitas..."
            />
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
            <Btn v="ghost" onClick={(e) => { e.preventDefault(); setModalOpen(false); }}>Batal</Btn>
            <Btn v="teal" type="submit" disabled={saveMut.isPending}>{saveMut.isPending ? "Menyimpan..." : "Simpan Kategori"}</Btn>
          </div>
        </form>
      </Modal>
    </div>
  );
}
