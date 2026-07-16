import React, { useState } from 'react';
import { CheckCircle, Clock3, LogIn, ShieldCheck, UserPlus } from 'lucide-react';
import { useAuth } from './AuthContext';

export default function AuthScreen() {
  const auth = useAuth();
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ displayName: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (auth.loading) return <div className="auth-loading">Carregando acesso seguro...</div>;

  if (auth.user && auth.profile?.status !== 'approved') {
    return (
      <main className="auth-shell">
        <section className="auth-card pending">
          <Clock3 size={34} />
          <h1>Acesso aguardando aprovação</h1>
          <p>Sua conta foi criada. Um Administrador precisa aprová-la antes do acesso aos dados compartilhados.</p>
          <button className="secondary" onClick={auth.refreshProfile}><CheckCircle size={15} /> Verificar novamente</button>
          <button className="ghost" onClick={auth.logout}>Sair</button>
        </section>
      </main>
    );
  }

  const submit = async event => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (mode === 'login') await auth.login(form.email, form.password);
      else await auth.register(form);
    } catch (submitError) {
      setError('Não foi possível concluir o acesso. Confira os dados e tente novamente.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="auth-brand"><ShieldCheck size={30} /><span>Dental Plus</span></div>
        <h1>{mode === 'login' ? 'Entrar no contabilizador' : 'Solicitar acesso'}</h1>
        <p>Use sua conta individual. Os dados de clientes continuam somente nos arquivos locais.</p>
        <form onSubmit={submit}>
          {mode === 'register' && (
            <label>Nome<input value={form.displayName} onChange={event => setForm({ ...form, displayName: event.target.value })} required maxLength={120} /></label>
          )}
          <label>E-mail<input type="email" value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} required /></label>
          <label>Senha<input type="password" value={form.password} onChange={event => setForm({ ...form, password: event.target.value })} required minLength={8} /></label>
          {error && <div className="status error">{error}</div>}
          <button className="primary large" disabled={busy}>
            {mode === 'login' ? <LogIn size={17} /> : <UserPlus size={17} />}
            {busy ? 'Aguarde...' : mode === 'login' ? 'Entrar' : 'Criar solicitação'}
          </button>
        </form>
        <button className="ghost" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
          {mode === 'login' ? 'Ainda não tenho acesso' : 'Já tenho uma conta'}
        </button>
      </section>
    </main>
  );
}
