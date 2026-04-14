# Arquitetura Funcional de Streaming (V2)

Este documento descreve a estrutura que foi estabilizada para garantir a reprodução de filmes e séries no app, superando bloqueios de CORS e 403.

## 1. Fluxo de Reprodução de Filmes
O sistema utiliza uma estratégia de "Múltiplas Rotas" no `GlobalPlayer.tsx`:

1.  **Rota Direta:** Tenta abrir o link original do IPTV. (Geralmente bloqueado por navegadores devido ao 401/403).
2.  **Cloudflare Proxy (`cf_proxy`):** Utiliza um Worker externo para tunelamento.
3.  **Supabase Proxy (`supabase_proxy`):** Utiliza a Edge Function `stream-proxy` como rota final e mais robusta.

### O que faz o `stream-proxy` funcionar:
- **User-Agent VLC:** O servidor IPTV "pensa" que é um player VLC acessando, não um navegador.
- **Transparência de Headers:** Repassa cabeçalhos de `Range` (essencial para Seek/pular tempo) e `Content-Type`.
- **Formato Original:** Não altera extensões (ex: .mkv continua .mkv), evitando quebras de link no servidor IPTV.
- **Tratamento de Erros:** Se o servidor IPTV retornar um erro (ex: 401), o proxy retorna o código mas não envia corpo JSON, permitindo que o player no frontend mude de rota sem gerar "Error Format".

## 2. Fluxo de Séries
O sistema não armazena milhares de episódios no banco de dados para evitar lentidão. Ele usa o conceito de **Busca Sob Demanda**:

1.  **Catalogação:** O `parse-m3u` identifica apenas o "Container" da série (Título e ID do Grupo).
2.  **Resolução de Episódios:** Quando o usuário abre uma série, a Edge Function `series-lookup` é chamada.
3.  **Busca Inteligente:**
    - Se o ID da série for encontrado no catálogo, busca direto.
    - Se não for encontrado (ou o ID mudou), o sistema limpa o título (ex: remove "Lei e Desordem") e faz uma busca por nome no painel IPTV.
    - O sistema normaliza acentos e caracteres especiais para garantir o match.

## 3. Estrutura do Catálogo (Otimização)
O processamento de conteúdos foi otimizado para lidar com a escala:
- **Títulos Únicos:** O banco `m3u_catalog` armazena apenas os ~17k títulos (Filmes e Séries).
- **Episódios:** São resolvidos em tempo real. Isso evita que o banco de dados precise gerenciar os >180k itens, o que tornaria a busca e o carregamento do app impossíveis.

---
**Status Atual:** Filmes operacionais. Séries em fase de ajuste fino na busca dinâmica.
