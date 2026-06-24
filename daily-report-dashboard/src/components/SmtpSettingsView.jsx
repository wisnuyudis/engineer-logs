import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { T, FONT, DISPLAY } from '../theme/tokens';
import { Btn, Card, Inp, Lbl, PwInp, Tag } from './ui/Primitives';
import { isAdmin } from '../constants/taxonomy';
import api from '../lib/api';

const SMTP_PROVIDERS = [
  { id: 'gmail', label: 'Gmail', host: 'smtp.gmail.com', port: 587, secure: false },
  { id: 'sendgrid', label: 'SendGrid', host: 'smtp.sendgrid.net', port: 587, secure: false },
  { id: 'ses', label: 'Amazon SES', host: 'email-smtp.us-east-1.amazonaws.com', port: 587, secure: false },
  { id: 'custom', label: 'Custom SMTP', host: '', port: 587, secure: false },
];

const blank = {
  provider: 'gmail',
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  user: '',
  pass: '',
  fromName: 'EngineerLog Admin',
  fromEmail: '',
};

export function SmtpSettingsView({ currentUser }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(blank);
  const [testTo, setTestTo] = useState(currentUser?.email || '');
  const [maintenanceForm, setMaintenanceForm] = useState({
    enabled: false,
    message: 'EngineerLog sedang dalam maintenance. Silakan coba lagi beberapa saat.',
  });

  const { data, isLoading } = useQuery({
    queryKey: ['smtp-settings'],
    queryFn: async () => {
      const res = await api.get('/settings/smtp');
      return res.data;
    },
    enabled: isAdmin(currentUser?.role),
  });

  const { data: maintenance, isLoading: loadingMaintenance } = useQuery({
    queryKey: ['maintenance-settings'],
    queryFn: async () => {
      const res = await api.get('/settings/maintenance');
      return res.data;
    },
    enabled: isAdmin(currentUser?.role),
  });

  useEffect(() => {
    if (!data?.settings) return;
    setForm((prev) => ({
      ...prev,
      ...data.settings,
      pass: '',
      port: data.settings.port || 587,
    }));
  }, [data]);

  useEffect(() => {
    if (!maintenance) return;
    setMaintenanceForm({
      enabled: Boolean(maintenance.enabled),
      message: maintenance.message || 'EngineerLog sedang dalam maintenance. Silakan coba lagi beberapa saat.',
    });
  }, [maintenance]);

  if (!isAdmin(currentUser?.role)) {
    return <div style={{ color: T.red, padding: 20 }}>Akses Ditolak. Hanya untuk Admin.</div>;
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        ...form,
        port: Number(form.port),
        pass: form.pass || undefined,
      };
      const res = await api.put('/settings/smtp', payload);
      return res.data;
    },
    onSuccess: (next) => {
      toast.success('SMTP settings berhasil disimpan.');
      queryClient.setQueryData(['smtp-settings'], next);
      setForm((prev) => ({ ...prev, pass: '' }));
    },
    onError: (error) => {
      toast.error(error?.response?.data?.error || 'Gagal menyimpan SMTP settings.');
    },
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/settings/smtp/test', { to: testTo });
      return res.data;
    },
    onSuccess: () => toast.success('Test email SMTP berhasil dikirim.'),
    onError: (error) => toast.error(error?.response?.data?.error || 'Gagal mengirim test email SMTP.'),
  });

  const maintenanceMutation = useMutation({
    mutationFn: async (payload) => {
      const res = await api.put('/settings/maintenance', payload);
      return res.data;
    },
    onSuccess: (next) => {
      toast.success(next.enabled ? 'Maintenance mode diaktifkan.' : 'Maintenance mode dinonaktifkan.');
      queryClient.setQueryData(['maintenance-settings'], next);
      queryClient.setQueryData(['maintenance-status'], next);
    },
    onError: (error) => toast.error(error?.response?.data?.error || 'Gagal mengubah maintenance mode.'),
  });

  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
  const selectProvider = (providerId) => {
    const provider = SMTP_PROVIDERS.find((item) => item.id === providerId) || SMTP_PROVIDERS[3];
    setForm((prev) => ({
      ...prev,
      provider: provider.id,
      host: provider.host || prev.host,
      port: provider.port,
      secure: provider.secure,
    }));
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
      <Card p={18}>
        <div style={{ display:'flex', justifyContent:'space-between', gap:12, flexWrap:'wrap', alignItems:'flex-start', marginBottom:14 }}>
          <div>
            <div style={{ fontSize:10,color:T.textMute,marginBottom:4,textTransform:'uppercase',letterSpacing:'.07em' }}>Operational Safety</div>
            <div style={{ fontSize:18,fontWeight:800,color:T.textPri,fontFamily:DISPLAY,marginBottom:6 }}>Maintenance Mode</div>
            <div style={{ fontSize:12,color:T.textMute,maxWidth:760,lineHeight:1.5 }}>
              Aktifkan saat migrasi, deployment, atau pekerjaan database. User non-admin akan melihat halaman maintenance dan API akan mengembalikan status 503.
            </div>
          </div>
          <Tag color={maintenance?.enabled ? T.amber : T.green} lo={maintenance?.enabled ? T.amberLo : T.greenLo}>
            {maintenance?.enabled ? 'Maintenance Active' : 'Operational'}
          </Tag>
        </div>

        {loadingMaintenance ? (
          <div style={{ fontSize:12,color:T.textMute }}>Memuat maintenance settings...</div>
        ) : (
          <div style={{ display:'grid', gap:12 }}>
            {maintenance?.forcedByEnv && (
              <div style={{ padding:'10px 12px',borderRadius:10,background:T.amberLo,border:`1px solid ${T.amber}45`,fontSize:12,color:T.amber,lineHeight:1.5 }}>
                Maintenance mode dipaksa oleh environment server. Toggle dashboard tidak bisa mengubah status ini.
              </div>
            )}
            <Inp
              label="Maintenance Message"
              value={maintenanceForm.message}
              onChange={(event) => setMaintenanceForm((prev) => ({ ...prev, message: event.target.value }))}
            />
            <div style={{ display:'flex', gap:8, justifyContent:'flex-end', flexWrap:'wrap' }}>
              <Btn
                v={maintenanceForm.enabled ? 'ghost' : 'primary'}
                onClick={() => {
                  const enabled = !maintenanceForm.enabled;
                  const payload = { ...maintenanceForm, enabled };
                  setMaintenanceForm(payload);
                  maintenanceMutation.mutate(payload);
                }}
                disabled={maintenanceMutation.isPending || maintenance?.forcedByEnv}
              >
                {maintenanceForm.enabled ? 'Nonaktifkan Maintenance' : 'Aktifkan Maintenance'}
              </Btn>
              <Btn
                v="teal"
                onClick={() => maintenanceMutation.mutate(maintenanceForm)}
                disabled={maintenanceMutation.isPending || maintenance?.forcedByEnv}
              >
                {maintenanceMutation.isPending ? 'Menyimpan...' : 'Simpan Pesan'}
              </Btn>
            </div>
          </div>
        )}
      </Card>

      <Card p={18}>
        <div style={{ display:'flex', justifyContent:'space-between', gap:12, flexWrap:'wrap', alignItems:'flex-start' }}>
          <div>
            <div style={{ fontSize:10,color:T.textMute,marginBottom:4,textTransform:'uppercase',letterSpacing:'.07em' }}>System Settings</div>
            <div style={{ fontSize:18,fontWeight:800,color:T.textPri,fontFamily:DISPLAY,marginBottom:6 }}>SMTP Settings</div>
            <div style={{ fontSize:12,color:T.textMute,maxWidth:720,lineHeight:1.5 }}>
              Konfigurasi ini dipakai untuk email invite member. Email pengirim boleh <strong style={{ color:T.textPri }}>@sdt.co.id</strong> atau <strong style={{ color:T.textPri }}>@gmail.com</strong>, sedangkan email member tetap dibatasi ke <strong style={{ color:T.textPri }}>@sdt.co.id</strong>.
            </div>
          </div>
          <Tag color={data?.configured ? T.green : T.amber} lo={data?.configured ? T.greenLo : T.amberLo}>
            {data?.configured ? 'Configured' : 'Not configured'}
          </Tag>
        </div>
      </Card>

      <Card p={18}>
        {isLoading ? (
          <div style={{ fontSize:12,color:T.textMute }}>Memuat SMTP settings...</div>
        ) : (
          <div style={{ display:'grid', gap:14 }}>
            <div>
              <Lbl>Email Provider</Lbl>
              <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                {SMTP_PROVIDERS.map((provider) => {
                  const active = form.provider === provider.id;
                  return (
                    <button key={provider.id} onClick={() => selectProvider(provider.id)} style={{ padding:'7px 13px',borderRadius:999,border:`1.5px solid ${active ? T.indigo : T.border}`,background:active ? T.indigoLo : T.surfaceHi,color:active ? T.indigoHi : T.textSec,cursor:'pointer',fontFamily:FONT,fontSize:12,fontWeight:active ? 800 : 600 }}>
                      {provider.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'minmax(0,1fr) 120px 120px', gap:10 }}>
              <Inp label="SMTP Host" value={form.host} onChange={(event) => set('host', event.target.value)} />
              <Inp label="Port" type="number" value={form.port} onChange={(event) => set('port', event.target.value)} />
              <div>
                <Lbl>Secure</Lbl>
                <button onClick={() => set('secure', !form.secure)} style={{ width:'100%',height:36,borderRadius:8,border:`1.5px solid ${form.secure ? T.green : T.border}`,background:form.secure ? T.greenLo : T.surfaceHi,color:form.secure ? T.green : T.textSec,cursor:'pointer',fontFamily:FONT,fontWeight:700 }}>
                  {form.secure ? 'SSL/TLS' : 'STARTTLS'}
                </button>
              </div>
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <Inp label="Username / SMTP User" value={form.user} onChange={(event) => set('user', event.target.value)} placeholder="smtp@sdt.co.id" />
              <PwInp label={data?.settings?.hasPassword ? 'Password / API Key Baru (opsional)' : 'Password / API Key'} value={form.pass} onChange={(event) => set('pass', event.target.value)} />
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <Inp label="From Name" value={form.fromName} onChange={(event) => set('fromName', event.target.value)} />
              <Inp label="From Email" type="email" value={form.fromEmail} onChange={(event) => set('fromEmail', event.target.value)} placeholder="engineerlog@sdt.co.id" />
            </div>

            <div style={{ padding:'10px 12px',borderRadius:10,background:T.surfaceHi,border:`1px solid ${T.border}`,fontSize:11,color:T.textMute,lineHeight:1.5 }}>
              Jika password dikosongkan saat update, password lama tetap dipakai. Password tidak ditampilkan kembali oleh API.
            </div>

            <div style={{ display:'flex', justifyContent:'flex-end', gap:8, borderTop:`1px solid ${T.border}`, paddingTop:12 }}>
              <Btn v="primary" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                {saveMutation.isPending ? 'Menyimpan...' : 'Simpan SMTP'}
              </Btn>
            </div>
          </div>
        )}
      </Card>

      <Card p={18}>
        <div style={{ display:'grid', gridTemplateColumns:'minmax(0,1fr) auto', gap:10, alignItems:'end' }}>
          <Inp label="Test Email To" type="email" value={testTo} onChange={(event) => setTestTo(event.target.value)} placeholder="nama@sdt.co.id" />
          <Btn v="teal" onClick={() => testMutation.mutate()} disabled={testMutation.isPending || !data?.configured}>
            {testMutation.isPending ? 'Mengirim...' : 'Kirim Test'}
          </Btn>
        </div>
      </Card>
    </div>
  );
}
