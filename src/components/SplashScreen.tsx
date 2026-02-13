import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import logoEagle from '@/assets/logo-eagle.png';

const SplashScreen = ({ onFinish }: { onFinish: () => void }) => {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(onFinish, 500);
    }, 2000);
    return () => clearTimeout(timer);
  }, [onFinish]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-black"
        >
          <motion.img
            src={logoEagle}
            alt="StreamTV"
            className="w-32 h-32 object-contain"
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.6, type: 'spring' }}
            style={{
              filter: 'drop-shadow(0 0 40px hsl(260 80% 60% / 0.6)) drop-shadow(0 0 80px hsl(210 90% 55% / 0.3))',
            }}
          />
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="mt-6 text-2xl font-display tracking-widest text-foreground"
          >
            STREAMTV
          </motion.p>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default SplashScreen;
