import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { motion } from 'framer-motion';
import { Lock, User, Eye, EyeOff } from 'lucide-react';
import logoEagle from '@/assets/logo-eagle.png';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

const ClientLogin = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const { loginClient } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const trimmedUser = username.trim();
    const trimmedPass = password.trim();
    if (!trimmedUser || !trimmedPass) {
      setError('Preencha todos os campos');
      return;
    }
    const result = loginClient(trimmedUser, trimmedPass);
    if (result.success) {
      navigate('/dashboard');
    } else if (result.reason === 'expired') {
      navigate('/expirado');
    } else {
      setError('Usuário ou senha incorretos');
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
            <img src={logoEagle} alt="StreamTV" className="w-14 h-14 object-contain" style={{ filter: 'drop-shadow(0 0 20px hsl(0 72% 51% / 0.5))' }} />
            <h1 className="text-4xl font-display tracking-wide text-foreground">
              STREAMTV
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
            />
            <button
              type="button"
              onClick={() => setShowPass(!showPass)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              {showPass ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>

          {error && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-primary text-sm text-center"
            >
              {error}
            </motion.p>
          )}

          <Button type="submit" className="w-full h-12 text-base font-semibold bg-primary hover:bg-primary/90 text-primary-foreground glow-red transition-all">
            Entrar
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
