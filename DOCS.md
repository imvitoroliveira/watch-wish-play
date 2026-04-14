# Documentação Técnica: Arquitetura Universal ID 📺

Este sistema utiliza uma **Arquitetura Híbrida** para garantir que listas de reprodução IPTV massivas (80MB+) funcionem de forma instantânea em navegadores e dispositivos móveis, sem sobrecarregar o cliente.

## 1. Funcionamento Central (ID-Based)

Diferente de sistemas comuns que baixam a lista inteira no celular do usuário, nós usamos o conceito de **Universal ID**:

1.  **Processamento no Servidor (Edge Functions)**:
    - O link M3U do cliente é processado em uma Edge Function (Supabase).
    - O sistema extrai apenas o **Título**, o **Stream ID** e o **Tipo** (Filme ou Série).
    - Esses dados são salvos de forma compactada e otimizada (`Título|ID|Tipo`).
2.  **Streaming Inteligente**:
    - O aplicativo não precisa do link completo do arquivo. Ele reconstrói a URL de streaming em tempo real usando as credenciais do cliente + o ID extraído.
    - Exemplo de URL gerada: `http://servidor.com/movie/usuario/senha/12345.mp4`.

## 2. Compatibilidade do Player (Playback)

Para resolver problemas de "tela preta" comuns em navegadores como Chrome e Edge:

- **Detecção Automática**: O Player identifica se o link é um manifesto HLS (`.m3u8`) ou um arquivo direto (`.mp4`, `.ts`).
- **HLS.js**: Usado apenas para links `.m3u8`.
- **Native Video**: Usado para arquivos diretos, permitindo que o navegador use aceleração de hardware.
- **Formato Preferencial**: Para VOD (Filmes), o sistema força o uso da extensão `.mp4`, que é a mais compatível com a web moderna.

## 3. Lógica de Mapeamento (Correções de Bug)

Implementamos uma lógica de **Prioridade de ID** no front-end:
- Se um filme aparece múltiplas vezes na lista (ex: versões HD, FHD e 4K), o sistema garante que a entrada que possui um **Stream ID válido** tenha preferência.
- Isso impede que entradas genéricas sem ID "quebrem" o botão de assistir.

## 4. Proxy Anti-Bloqueio (CORS)

Utilizamos um **Worker do Cloudflare** customizado para contornar restrições de CORS impostas pelos servidores IPTV.
- Todas as requisições de streaming passam pelo proxy: `https://seu-proxy.workers.dev/http://servidor-iptv.com/...`
- Isso é essencial para que o vídeo carregue dentro do navegador sem ser bloqueado pela política de segurança.

---
*Documentação atualizada em 28/03/2026.*

## 5. Sistema de Versionamento V1/V2

Para garantir estabilidade durante o desenvolvimento de novas funcionalidades, o app implementa um **sistema de versões**:

### Como funciona:
1. Após login bem-sucedido, o usuário é direcionado para a **Tela de Seleção**
2. Ele escolhe entre **V1 (Clássico)** ou **V2 (Nova Experiência)**
3. A escolha é salva em `localStorage` (chave: `msc_app_version`)
4. Na próxima vez que logar, irá direto para a versão escolhida (sem perguntar novamente)
5. Para trocar de versão, basta deslogar e logar novamente

### Arquitetura:
- **V1** (`/dashboard`): `Dashboard.tsx` original — **NUNCA é modificado**
- **V2** (`/dashboard-v2`): `DashboardV2.tsx` — cópia com funcionalidades novas
- **Seletor** (`/version-select`): `VersionSelect.tsx` — tela premium com cards comparativos

### Regras de Ouro:
- ✅ Novas features → **sempre em DashboardV2** e componentes novos
- ❌ **NUNCA altere** `Dashboard.tsx`, `DashboardHeader.tsx` ou outros componentes V1
- ✅ Componentes compartilhados (MovieGrid, MovieCard, etc.) podem ser editados com cuidado

## 6. Player In-App — V2 Exclusivo

O sistema de reprodução in-app permite assistir filmes e séries **dentro do navegador** sem depender de apps externos, operando num pipeline complexo de contorno de restrições das provedoras.

### Componentes e UX Unificada (Framer Motion):
- **`VideoContext.tsx`**: Estado global do player (dual-mode V1/V2)
  - V1: `playVideo()` abre link em nova aba (stub de compatibilidade)
  - V2: `playVideo()` ativa o GlobalPlayer fullscreen
- **`GlobalPlayer.tsx`**: Player visual com interface unificada
  - Utiliza uma única e contígua tag `<video>` no DOM (para que a reprodução não 'crashe' ou reinicie buffers).
  - **Fullscreen overlay**: Tela cheia com controles sobrepostos com z-index avançado e `pointer-events` configurados para evitar bloqueio de cliques.
  - **Mini-player**: Graças à unificação com React Framer Motion, a transição pro modo Picture-in-Picture flutuante no canto inferior direito ocorre sem queda de reprodução.

### Pipeline de Reprodução Dinâmico (Bypass de Proteções):
Como servidores de IPTV injetam barreiras **CORS** pesadas e bloqueiam a visualização de web browsers por ausência do `User-Agent` nativo de players IPTV, nós utilizamos um pipeline inteligente em dois níveis:

```
MovieModal → playVideo(url) → VideoContext → GlobalPlayer
                                    ↓
                         [ stream-lookup (Edge) ] -> Extração de IDs
                                    ↓
                          [ stream-proxy (Edge) ] -> Spoof de User-Agent (VLC)
                                    ↓
                         Cloudflare Worker (CORS bypass headers)
                                    ↓
                 Header Injection / Conversão MKV -> MP4 on the fly
                                    ↓
                            <video> renderizado
```

### Formatos Suportados e Resoluções:
| Formato | Motor | Notas do Pipeline |
|---------|-------|-------|
| `.mp4` | `<video>` nativo | Mais compatível. Roda instantaneamente. |
| `.m3u8` | HLS.js | Streaming adaptativo — injeta scripts HLS por trás do proxy. |
| `.ts` | `<video>` nativo | O Worker traduz os blocos segmentados em stream web. |
| `.mkv` | `<video>` nativo | O proxy mascarador envelopa o `Content-Type` de vídeo para enganar o navegador e permitir que rode nativo via HTML5. |

---
*Documentação atualizada em 07/04/2026.*
