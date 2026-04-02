import { glob } from './glob';
import { read } from './read';
import { grep } from './grep';

export interface CodeAnalysis {
  files: string[];
  patterns: Record<string, string[]>;
  missingFeatures: string[];
  existingFeatures: string[];
  edgeFunctions: string[];
  tables: string[];
  components: string[];
  hooks: string[];
}

export interface SkillSuggestion {
  name: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  relatedFiles: string[];
  implementation: string;
}

const FEATURE_PATTERNS: Record<string, string[]> = {
  'Authentication': ['auth', 'login', 'logout', 'session'],
  'Billing': ['payment', 'billing', 'subscription', 'renewal'],
  'Streaming': ['video', 'player', 'stream', 'm3u', 'hls'],
  'Notifications': ['push', 'notification', 'alert'],
  'Database': ['database', 'supabase', 'postgres', 'table'],
  'API Integration': ['api', 'proxy', 'fetch', 'tmdb'],
  'Admin Panel': ['admin', 'panel', 'manage', 'dashboard'],
  'Client Features': ['client', 'customer', 'user'],
  'Testing': ['test', 'vitest', 'testing'],
  'PWA': ['pwa', 'service', 'manifest', 'offline'],
};

const COMMON_INTEGRATIONS = [
  { name: 'TMDB', description: 'The Movie Database API', files: ['tmdb.ts'] },
  { name: 'Football-API', description: 'Football matches API', files: ['football-api.ts'] },
  { name: 'PushAlert', description: 'Push notifications', files: ['usePushNotifications.ts'] },
  { name: 'Google Sheets', description: 'Google Sheets sync', files: ['google-sheets-sync'] },
  { name: 'Cakto', description: 'Payment gateway', files: ['cakto-webhook'] },
  { name: 'AbacatePay', description: 'Payment gateway', files: ['abacatepay-webhook'] },
  { name: 'n8n', description: 'Automation', files: ['n8n-proxy'] },
];

export async function analyzeCodebase(): Promise<CodeAnalysis> {
  const srcFiles = await glob('src/**/*.{ts,tsx}');
  const supabaseFiles = await glob('supabase/**/*.{ts,sql}');
  
  const patterns: Record<string, string[]> = {};
  for (const [feature, keywords] of Object.entries(FEATURE_PATTERNS)) {
    patterns[feature] = [];
    for (const file of srcFiles) {
      const content = await read(file).catch(() => '');
      for (const keyword of keywords) {
        if (content.toLowerCase().includes(keyword)) {
          patterns[feature].push(file);
          break;
        }
      }
    }
  }

  const edgeFunctions = supabaseFiles
    .filter(f => f.includes('functions/'))
    .map(f => f.split('/').slice(-2, -1)[0])
    .filter(Boolean);

  const tableMatches = await grep(
    'CREATE TABLE|Table\\(|tables:',
    { include: '*.ts' }
  );
  
  const tables: string[] = [];
  for (const file of Object.keys(tableMatches)) {
    const content = await read(file).catch(() => '');
    const matches = content.match(/(?:CREATE TABLE|Table\()\s*["']?(\w+)["']?/gi);
    if (matches) {
      tables.push(...matches.map(m => m.replace(/CREATE TABLE|Table\(|\s|["']/gi, '')));
    }
  }

  const components = srcFiles
    .filter(f => f.includes('components/') && !f.includes('ui/'))
    .map(f => f.split('/').pop()?.replace('.tsx', '') || '');

  const hooks = srcFiles
    .filter(f => f.includes('hooks/'))
    .map(f => f.split('/').pop()?.replace('.ts', '') || '');

  const existingFeatures = Object.keys(patterns).filter(f => patterns[f].length > 0);

  return {
    files: srcFiles,
    patterns,
    existingFeatures,
    missingFeatures: Object.keys(FEATURE_PATTERNS).filter(f => !existingFeatures.includes(f)),
    edgeFunctions,
    tables,
    components,
    hooks,
  };
}

export async function analyzePromptForSkills(prompt: string, analysis: CodeAnalysis): Promise<SkillSuggestion[]> {
  const suggestions: SkillSuggestion[] = [];
  const lowerPrompt = prompt.toLowerCase();

  const skillKeywords: Record<string, string[]> = {
    'AI Chat': ['chat', 'ai', 'gpt', 'assistant', 'mensagem', 'conversar'],
    'Analytics': ['analytics', 'estatística', 'stats', 'métricas', 'dashboard'],
    'Social Features': ['social', 'share', 'compartilhar', 'amigo', 'avaliação'],
    'Offline Mode': ['offline', 'cache', 'local', 'sincronizar'],
    'Multi-language': ['i18n', 'tradução', 'idioma', 'língua', 'português', 'inglês'],
    'Dark Mode': ['tema', 'dark', 'modo escuro', 'tema claro'],
    'Search Enhancement': ['busca', 'search', 'filtro', 'avançado'],
    'User Preferences': ['preferência', 'configuração', 'ajuste', 'personalizar'],
  };

  for (const [skillName, keywords] of Object.entries(skillKeywords)) {
    const hasKeyword = keywords.some(k => lowerPrompt.includes(k));
    const alreadyExists = analysis.existingFeatures.some(e => 
      skillName.toLowerCase().includes(e.toLowerCase())
    );

    if (hasKeyword && !alreadyExists) {
      suggestions.push({
        name: skillName,
        description: `Implementa funcionalidade de ${skillName} baseada no prompt`,
        priority: 'high',
        relatedFiles: [],
        implementation: `Criar componente de ${skillName} e integrar com o sistema existente`,
      });
    }
  }

  if (lowerPrompt.includes('skill') || lowerPrompt.includes('criar')) {
    suggestions.push({
      name: 'Auto-Skill Builder',
      description: 'Sistema para identificar e criar novas skills automaticamente',
      priority: 'high',
      relatedFiles: ['src/lib/skill-analyzer.ts'],
      implementation: 'Expandir o sistema de análise para criar skills automaticamente',
    });
  }

  return suggestions;
}

export function generateSkillCode(suggestion: SkillSuggestion): string {
  return `
// Auto-generated skill: ${suggestion.name}
// ${suggestion.description}

export const ${suggestion.name.replace(/[^a-zA-Z]/g, '')}Skill = {
  name: "${suggestion.name}",
  description: "${suggestion.description}",
  priority: "${suggestion.priority}",
  
  analyze: (prompt: string) => {
    // Analyze prompt for ${suggestion.name} related requests
    return prompt.toLowerCase().includes("${suggestion.name.toLowerCase()}");
  },
  
  implement: async (context) => {
    // Implementation for ${suggestion.name}
    // Related files: ${suggestion.relatedFiles.join(', ') || 'New files needed'}
    console.log("Implementing ${suggestion.name}...");
  }
};
  `.trim();
}
