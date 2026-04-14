# Registro de Arquitetura e Soluções (IPTV Streaming) 📜

Este documento detalha a evolução do sistema de streaming, os problemas encontrados e as soluções definitivas aplicadas.

## 1. O Desafio Inicial: M3U Gigantesca (80MB+)
- **Problema**: O aplicativo tentava processar listas M3U brutas no navegador do usuário.
- **Consequência**: Travamentos, lentidão extrema e impossibilidade de uso em dispositivos móveis.
- **Status**: **CORRIGIDO**.

## 2. Solução 1: Arquitetura Universal ID (V1)
- **Estratégia**: Mover o processamento para o servidor (Supabase Edge Functions) e trazer para o celular apenas "Título|ID".
- **Problema encontrado**: Algumas listas (como a atual do usuário) não possuem IDs numéricos padronizados ou o formato da URL bloqueava a extração. O console mostrava `Item ID: (vazio)`.
- **Status**: **SUPERADO (Evoluindo para V2)**.

## 3. Falha de Reprodução: Tela Preta
- **Problema**: Tentativa de forçar HLS (`.m3u8`) em todos os conteúdos.
- **Causa**: Alguns servidores IPTV servem arquivos diretos (`.mp4`, `.ts`) e não aceitam a troca de extensão para HLS. O navegador bloqueia formatos `.ts` sem um player específico.
- **Status**: **CORRIGIDO** (O player agora detecta o formato automaticamente e usa o motor nativo para MP4/TS).

## 4. Solução Final: Lógica Híbrida 2.0 (Placeholder System)
- **Estratégia**: Se não houver um ID numérico, o sistema salvará a **URL completa camuflada**.
- **Segurança**: Para não expor sua senha no banco de dados, o sistema substitui o usuário e a senha da URL por `[USER]` e `[PASS]` antes de salvar.
- **Funcionamento**: O aplicativo reconstrói o link final apenas na hora do Play, usando as credenciais do usuário logado naquele momento.
- **Status**: **EM IMPLEMENTAÇÃO**.

---
### O que já foi corrigido e está funcional:
- [x] **Busca de Clientes**: Barra de pesquisa no Painel Administrativo.
- [x] **Performance**: Carregamento instantâneo do catálogo (de 30 segundos para < 1 segundo).
- [x] **Deduplicação**: Títulos com ID têm prioridade sobre títulos vazios.
- [x] **Player**: Suporte nativo para MP4.

### O que está sendo corrigido agora:
- [ ] **Extração Universal de URLs**: Garantir que todo filme tenha um link, mesmo que não tenha ID numérico.
- [ ] **Camuflagem de Credenciais**: Segurança total no armazenamento da lista.

---

## 5. Sistema de Versionamento V1/V2 (06/04/2026)
- **Motivação**: Permitir desenvolvimento de features novas sem risco de quebrar a versão estável.
- **Solução**: Tela de seleção pós-login (`/version-select`) onde o usuário escolhe entre V1 (Clássico) e V2 (Nova Experiência).
- **Arquitetura**: V1 usa `Dashboard.tsx` (intocado). V2 usa `DashboardV2.tsx` (cópia + melhorias).
- **Persistência**: `localStorage` chave `msc_app_version`. Logins futuros pulam direto para a versão salva.
- **Status**: **IMPLEMENTADO ✅**

## 6. VideoContext + GlobalPlayer (06/04/2026)
- **Problema**: `MovieModal.tsx` importava `useVideo` de `@/contexts/VideoContext` — arquivo que **nunca existiu**. O botão "Assistir Agora" era visível mas nunca funcionou.
- **Solução**: Criado `VideoContext.tsx` com dual-mode:
  - V1: `playVideo()` age como stub (abre link em nova aba)
  - V2: `playVideo()` ativa o `GlobalPlayer` dentro do app
- **GlobalPlayer**: Overlay fullscreen com HLS.js + `<video>` nativo. Inclui mini-player (PiP), auto-hide de controles, barra de progresso seekable, e tratamento visual de erros.
- **Proxy**: Todas as streams passam pelo Cloudflare Worker (`buildProxyUrl`) para contornar CORS.
- **Status**: **IMPLEMENTADO ✅**

## 7. Evolução do Player V2 (CORS Avançado & UX) (07/04/2026)
- **Problema 1 (CORS e 403)**: Playback direto de servidores IPTV devolvia erros de CORS (Access-Control-Allow-Origin) ou 403 (Proibido) devido à falta de `User-Agent` de players IPTV populares.
  - **Tentativa falha**: Usar tags `cors()` no cliente ou no Cloudflare não funcionava pois a restrição de CORS partia da ponta e precisávamos modificar a chamada.
  - **Solução (stream-proxy)**: Criada Edge Function `stream-proxy` acoplada ao Cloudflare Worker que mascareia o `User-Agent` para simular o VLC player, liberando as chaves.
- **Problema 2 (Compatibilidade de Extensão - MKV)**: Navegadores não renderizam vídeos `.mkv`.
  - **Solução em tempo real**: O `stream-proxy` intercepta os headers e reescreve `Content-Type` de vídeo para `video/mp4`, enganando a engine de renderização `<video>`, que passa a tocar fluidamente.
- **Problema 3 (Quebra da reprodução ao Minimizar - Tela Preta)**: Ao ativar o PiP (Mini-player) o vídeo recarregava o buffer e truncava a sessão.
  - **Causa**: O React desmontava/destruia a tag `<video>` entre transições condicionais do layout (`if isMini / else isFullscreen`).
  - **Solução**: Árvore unificada via `Framer Motion`. O `<video>` tornou-se incondicional com CSS dinâmico. A reprodução não sofre engasgos nas trocas de view. O layout flutuante também teve seus overlays de clicks (`pointer-events-none`) recalibrados para reviver o "X" de fechar.
- **Status**: **IMPLEMENTADO ✅**
