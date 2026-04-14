import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { motion } from 'framer-motion';
import { Lock, User, Eye, EyeOff, Loader2, Check } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import eagleLogo from '@/assets/eagle-logo.png';

const REMEMBER_KEY = 'msc_remember_me';

function getSavedCredentials(): { u: string, p: string } | null {
  try {
    const saved = localStorage.getItem(REMEMBER_KEY);
    if (!saved) return null;
    const parsed = JSON.parse(saved);
    if (typeof parsed === 'string') return { u: parsed, p: '' };
    return { u: parsed.username || parsed.u || '', p: parsed.password || parsed.p || '' };
  } catch { return null; }
}

const ClientLogin = () => {
  const saved = getSavedCredentials();
  const [username, setUsername] = useState(saved?.u || '');
  const [password, setPassword] = useState(saved?.p || '');
  const [showPass, setShowPass] = useState(false);
  const [rememberMe, setRememberMe] = useState(!!saved);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { loginClient, clientsLoading } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const trimmedUser = username.trim();
    const trimmedPass = password.trim();
    if (!trimmedUser || !trimmedPass) {
      setError('Preencha todos os campos');
      return;
    }

    setLoading(true);
    try {
      const result = await loginClient(trimmedUser, trimmedPass);
      if (result.success) {
        if (rememberMe) {
          localStorage.setItem(REMEMBER_KEY, JSON.stringify({ u: trimmedUser, p: trimmedPass }));
        } else {
          localStorage.removeItem(REMEMBER_KEY);
        }
        // Checa se já tem versão escolhida — se sim, pula direto
        const savedVersion = localStorage.getItem('msc_app_version');
        if (savedVersion === 'v1') {
          navigate('/dashboard');
        } else if (savedVersion === 'v2') {
          navigate('/dashboard-v2');
        } else {
          navigate('/version-select');
        }
      } else if (result.reason === 'expired') {
        navigate('/expirado');
      } else if (result.reason === 'already_online') {
        setError('Esta conta já está em uso em outro dispositivo.');
      } else if (result.reason === 'rate_limited') {
        setError('Muitas tentativas. Aguarde 1 minuto.');
      } else {
        setError('Usuário ou senha incorretos');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute inset-0 hero-gradient opacity-50" />
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-primary/5 blur-[120px]" />

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="relative z-10 w-full max-w-md px-6"
      >
        {/* Logo */}
        <div className="text-center mb-10">
          <motion.div
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: 'spring' }}
            className="inline-flex items-center gap-3 mb-4"
          >
            <div className="w-14 h-14 rounded-xl flex items-center justify-center">
              <img src={eagleLogo} alt="StreamTV" className="w-14 h-14 object-contain" />
            </div>
            <h1 className="text-4xl font-display tracking-wide text-foreground">
              MEU STREAM
            </h1>
          </motion.div>
          <p className="text-muted-foreground text-sm">
            O seu cinema pessoal. Entre para começar.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <Input
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="Usuário"
              className="pl-11 h-12 bg-card border-border text-foreground placeholder:text-muted-foreground"
              maxLength={100}
              disabled={loading}
            />
          </div>

          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <Input
              type={showPass ? 'text' : 'password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Senha"
              className="pl-11 pr-11 h-12 bg-card border-border text-foreground placeholder:text-muted-foreground"
              maxLength={100}
              disabled={loading}
            />
            <button
              type="button"
              onClick={() => setShowPass(!showPass)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              {showPass ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <button
              type="button"
              onClick={() => setRememberMe(!rememberMe)}
              className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${
                rememberMe
                  ? 'bg-primary border-primary'
                  : 'border-border bg-card hover:border-muted-foreground'
              }`}
            >
              {rememberMe && <Check className="w-3 h-3 text-primary-foreground" />}
            </button>
            <span className="text-sm text-muted-foreground">Lembre-se de mim</span>
          </label>

          {error && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-primary text-sm text-center"
            >
              {error}
            </motion.p>
          )}

          <Button
            type="submit"
            disabled={loading || clientsLoading}
            className="w-full h-12 text-base font-semibold bg-primary hover:bg-primary/90 text-primary-foreground glow-red transition-all"
          >
            {loading ? (
              <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Entrando...</>
            ) : clientsLoading ? (
              <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Carregando...</>
            ) : (
              'Entrar'
            )}
          </Button>
        </form>

        <p className="text-center mt-8 text-xs text-muted-foreground">
          Área do gestor?{' '}
          <button
            onClick={() => navigate('/gestor')}
            className="text-accent hover:underline"
          >
            Acesse aqui
          </button>
        </p>
      </motion.div>
    </div>
  );
};

export default ClientLogin;
