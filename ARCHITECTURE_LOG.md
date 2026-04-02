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
