import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { T, DISPLAY } from '../theme/tokens';
import { Card, Btn, Inp, Lbl, Modal, MHead, Tag } from './ui/Primitives';
import { isAdmin } from '../constants/taxonomy';
import api from '../lib/api';

const EMPTY_FORM = { name: '', address: '', isActive: true };

const normalizeForm = (form) => ({
  ...(form.id ? { id: form.id } : {}),
  name: String(form.name || '').trim().replace(/\s+/g, ' '),
  address: String(form.address || '').trim(),
  isActive: Boolean(form.isActive),
});

export function CustomersView({ currentUser }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [includeInactive, setIncludeInactive] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const { data: customers = [], isLoading } = useQuery({
    queryKey: ['customers', includeInactive],
    queryFn: async () => {
      const res = await api.get('/customers', { params: { includeInactive } });
      return res.data;
    },
    enabled: isAdmin(currentUser?.role),
  });

  const filteredCustomers = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return customers;
    return customers.filter((customer) => (
      `${customer.name || ''} ${customer.address || ''}`.toLowerCase().includes(needle)
    ));
  }, [customers, search]);

  const saveMutation = useMutation({
    mutationFn: async (payload) => {
      if (payload.id) {
        const res = await api.put(`/customers/${payload.id}`, payload);
        return res.data;
      }
      const res = await api.post('/customers', payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      toast.success('Master customer berhasil disimpan.');
      setModalOpen(false);
    },
    onError: (error) => toast.error(error?.response?.data?.error || 'Gagal menyimpan customer.'),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isActive }) => {
      const res = await api.put(`/customers/${id}/toggle`, { isActive });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      toast.success('Status customer berhasil diubah.');
    },
    onError: (error) => toast.error(error?.response?.data?.error || 'Gagal mengubah status customer.'),
  });

  if (!isAdmin(currentUser?.role)) {
    return <div style={{ color: T.red, padding: 20 }}>Akses Ditolak. Hanya untuk Admin.</div>;
  }

  const openNew = () => {
    setForm(EMPTY_FORM);
    setModalOpen(true);
  };

  const openEdit = (customer) => {
    setForm({
      id: customer.id,
      name: customer.name || '',
      address: customer.address || '',
      isActive: Boolean(customer.isActive),
    });
    setModalOpen(true);
  };

  const submit = (event) => {
    event.preventDefault();
    const payload = normalizeForm(form);
    if (!payload.name) {
      toast.error('Nama perusahaan wajib diisi.');
      return;
    }
    saveMutation.mutate(payload);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card p={18}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 10, color: T.textMute, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.07em' }}>Master Data</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: T.textPri, fontFamily: DISPLAY, marginBottom: 6 }}>Master Customer</div>
            <div style={{ fontSize: 12, color: T.textMute, maxWidth: 760, lineHeight: 1.5 }}>
              Simpan nama perusahaan dan alamat customer agar data customer konsisten untuk activity, report, dan kebutuhan operasional.
            </div>
          </div>
          <Btn v="teal" onClick={openNew}>Tambah Customer</Btn>
        </div>
      </Card>

      <Card p={14}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 10, alignItems: 'end' }}>
          <Inp
            label="Cari Customer"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Cari nama perusahaan atau alamat..."
          />
          <Btn
            v={includeInactive ? 'primary' : 'ghost'}
            onClick={() => setIncludeInactive((value) => !value)}
            style={{ height: 36, whiteSpace: 'nowrap' }}
          >
            {includeInactive ? 'Tampilkan Semua' : 'Aktif Saja'}
          </Btn>
        </div>
      </Card>

      {isLoading ? (
        <div style={{ color: T.textMute, fontSize: 13 }}>Memuat data customer...</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
          {filteredCustomers.map((customer) => (
            <Card key={customer.id} p={16} style={{ display: 'flex', flexDirection: 'column', gap: 12, opacity: customer.isActive ? 1 : 0.62 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: T.textPri, lineHeight: 1.35, wordBreak: 'break-word' }}>{customer.name}</div>
                  <div style={{ marginTop: 6 }}>
                    <Tag color={customer.isActive ? T.green : T.textMute} lo={customer.isActive ? T.greenLo : T.surfaceHi} small>
                      {customer.isActive ? 'Active' : 'Inactive'}
                    </Tag>
                  </div>
                </div>
                <button
                  onClick={() => toggleMutation.mutate({ id: customer.id, isActive: !customer.isActive })}
                  disabled={toggleMutation.isPending}
                  aria-label={customer.isActive ? 'Nonaktifkan customer' : 'Aktifkan customer'}
                  style={{ width: 44, height: 24, borderRadius: 12, background: customer.isActive ? T.greenLo : T.surfaceHi, border: `1.5px solid ${customer.isActive ? T.green : T.border}`, position: 'relative', cursor: 'pointer', transition: 'all .2s', flexShrink: 0 }}
                >
                  <span style={{ width: 16, height: 16, borderRadius: '50%', background: customer.isActive ? T.green : T.textMute, position: 'absolute', top: 2.5, left: customer.isActive ? 22 : 3, transition: 'all .2s' }} />
                </button>
              </div>

              <div style={{ minHeight: 54, fontSize: 12, color: T.textMute, lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {customer.address || <span style={{ fontStyle: 'italic' }}>Alamat belum diisi.</span>}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <Btn sz="sm" v="ghost" onClick={() => openEdit(customer)}>Edit</Btn>
              </div>
            </Card>
          ))}

          {!filteredCustomers.length && (
            <Card p={18} style={{ gridColumn: '1 / -1', textAlign: 'center', color: T.textMute, fontSize: 13 }}>
              Tidak ada customer yang cocok.
            </Card>
          )}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} width={560}>
        <MHead title={form.id ? 'Edit Customer' : 'Tambah Customer'} sub="Data ini menjadi master nama perusahaan dan alamat customer." onClose={() => setModalOpen(false)} />
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Inp
            label="Nama Perusahaan"
            required
            value={form.name}
            onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
            placeholder="PT. Contoh Teknologi Indonesia"
          />
          <div>
            <Lbl>Alamat</Lbl>
            <textarea
              value={form.address}
              onChange={(event) => setForm((prev) => ({ ...prev, address: event.target.value }))}
              rows={4}
              placeholder="Jl. Contoh No. 10, Jakarta"
              style={{ width: '100%', padding: '10px 12px', borderRadius: 8, background: T.surfaceHi, border: `1.5px solid ${T.border}`, color: T.textPri, outline: 'none', fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }}
            />
          </div>
          <label style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 12, color: T.textSec, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(event) => setForm((prev) => ({ ...prev, isActive: event.target.checked }))}
            />
            Customer aktif
          </label>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 6 }}>
            <Btn v="ghost" type="button" onClick={() => setModalOpen(false)}>Batal</Btn>
            <Btn v="teal" type="submit" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? 'Menyimpan...' : 'Simpan Customer'}
            </Btn>
          </div>
        </form>
      </Modal>
    </div>
  );
}
