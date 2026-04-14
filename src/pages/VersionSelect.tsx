import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { motion } from 'framer-motion';
import { Shield, Rocket, Check, ArrowRight } from 'lucide-react';
import eagleLogo from '@/assets/eagle-logo.png';

const VERSION_KEY = 'msc_app_version';

const VersionSelect = () => {
  const navigate = useNavigate();
  const { isClient } = useAuth();
  const [selected, setSelected] = useState<'v1' | 'v2' | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);

  // Protege: se não está logado, volta ao login
  if (!isClient) {
    navigate('/');
    return null;
  }

  const handleSelect = (version: 'v1' | 'v2') => {
    setSelected(version);
    setIsTransitioning(true);
    localStorage.setItem(VERSION_KEY, version);

    setTimeout(() => {
      if (version === 'v1') {
        navigate('/dashboard');
      } else {
        navigate('/dashboard-v2');
      }
    }, 600);
  };

  const versions = [
    {
      id: 'v1' as const,
      title: 'Clássico',
      subtitle: 'V1',
      description: 'Experiência original com todas as funcionalidades atuais. Estável e confiável.',
      icon: Shield,
      features: [
        'Catálogo de filmes e séries',
        'Cine-Roleta e Agenda Esportiva',
        'Sistema de favoritos',
        'Central de Ajuda',
      ],
      gradient: 'from-blue-600/20 to-blue-900/20',
      borderColor: 'border-blue-500/30',
      accentColor: 'text-blue-400',
      glowColor: 'shadow-blue-500/20',
      bgHover: 'hover:border-blue-400/60',
    },
    {
      id: 'v2' as const,
      title: 'Nova Experiência',
      subtitle: 'V2',
      description: 'Tudo da V1 + reprodução de conteúdo direto no navegador, sem apps externos.',
      icon: Rocket,
      features: [
        'Tudo da versão clássica',
        'Player integrado in-app',
        'Mini-player flutuante',
        'Controles avançados de reprodução',
      ],
      gradient: 'from-primary/20 to-red-900/20',
      borderColor: 'border-primary/30',
      accentColor: 'text-primary',
      glowColor: 'shadow-primary/20',
      bgHover: 'hover:border-primary/60',
      badge: 'NOVO',
    },
  ];

  return (
    <div className="min-h-screen bg-background flex items-center justify-center relative overflow-hidden">
      {/* Background FX */}
      <div className="absolute inset-0 hero-gradient opacity-40" />
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[700px] h-[700px] rounded-full bg-primary/5 blur-[150px]" />
      <div className="absolute bottom-0 left-0 w-[400px] h-[400px] rounded-full bg-blue-500/5 blur-[120px]" />

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: isTransitioning ? 0 : 1, y: isTransitioning ? -30 : 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className="relative z-10 w-full max-w-3xl px-6"
      >
        {/* Header */}
        <div className="text-center mb-12">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.15, type: 'spring', stiffness: 200 }}
            className="inline-flex items-center gap-3 mb-5"
          >
            <img src={eagleLogo} alt="MEU STREAM" className="w-12 h-12 object-contain" />
            <h1 className="text-3xl font-display tracking-wide text-foreground">MEU STREAM</h1>
          </motion.div>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="text-muted-foreground text-base"
          >
            Escolha sua experiência
          </motion.p>
        </div>

        {/* Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {versions.map((v, i) => {
            const Icon = v.icon;
            const isSelected = selected === v.id;
            return (
              <motion.button
                key={v.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 + i * 0.12 }}
                onClick={() => handleSelect(v.id)}
                disabled={isTransitioning}
                className={`
                  relative text-left p-6 rounded-2xl border transition-all duration-300 
                  bg-gradient-to-br ${v.gradient} backdrop-blur-sm
                  ${v.borderColor} ${v.bgHover}
                  ${isSelected ? `ring-2 ring-offset-2 ring-offset-background ${v.id === 'v1' ? 'ring-blue-400' : 'ring-primary'} scale-[1.02] shadow-xl ${v.glowColor}` : 'shadow-lg'}
                  disabled:opacity-60 disabled:pointer-events-none
                  group
                `}
              >
                {/* Badge */}
                {v.badge && (
                  <span className="absolute -top-2.5 right-4 px-3 py-0.5 text-[10px] font-bold uppercase tracking-widest bg-primary text-primary-foreground rounded-full shadow-lg">
                    {v.badge}
                  </span>
                )}

                {/* Icon + Title */}
                <div className="flex items-center gap-3 mb-4">
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center bg-background/50 border border-border/50 ${v.accentColor}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-foreground font-semibold text-lg leading-tight">{v.title}</h3>
                    <span className={`text-xs font-mono uppercase tracking-widest ${v.accentColor}`}>{v.subtitle}</span>
                  </div>
                </div>

                {/* Description */}
                <p className="text-muted-foreground text-sm mb-5 leading-relaxed">{v.description}</p>

                {/* Features */}
                <ul className="space-y-2 mb-6">
                  {v.features.map((f, fi) => (
                    <li key={fi} className="flex items-center gap-2 text-sm text-foreground/80">
                      <Check className={`w-3.5 h-3.5 flex-shrink-0 ${v.accentColor}`} />
                      {f}
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                <div className={`flex items-center gap-2 text-sm font-medium ${v.accentColor} group-hover:gap-3 transition-all`}>
                  Selecionar <ArrowRight className="w-4 h-4" />
                </div>

                {/* Selected checkmark */}
                {isSelected && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className={`absolute top-4 right-4 w-7 h-7 rounded-full flex items-center justify-center ${v.id === 'v1' ? 'bg-blue-500' : 'bg-primary'} text-white`}
                  >
                    <Check className="w-4 h-4" />
                  </motion.div>
                )}
              </motion.button>
            );
          })}
        </div>

        {/* Footer */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="text-center mt-8 text-xs text-muted-foreground/60"
        >
          Você pode mudar sua escolha a qualquer momento voltando a esta tela pelo login.
        </motion.p>
      </motion.div>
    </div>
  );
};

export default VersionSelect;
