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
