# Skill: Auto-Skill Builder

## Purpose
This skill analyzes user prompts and the codebase to identify missing skills, enhance existing ones, and create new capabilities.

## How It Works

1. **Prompt Analysis**: Analyzes the user's prompt to understand the intent and required functionality
2. **Codebase Scan**: Explores the codebase to find relevant code, patterns, and existing implementations
3. **Gap Identification**: Identifies what's missing or needs improvement
4. **Implementation**: Creates or enhances skills automatically

## Detection Patterns

### Missing Features
- User requests functionality not present in codebase
- Dependencies mentioned but not integrated
- API integrations not yet implemented

### Enhancement Opportunities
- Code that could be abstracted into reusable patterns
- Repeated patterns that could benefit from automation
- Documentation that could be auto-generated

## Skill Structure

```typescript
interface Skill {
  name: string;
  description: string;
  triggerPatterns: string[];
  analyze: (prompt: string, context: CodeContext) => AnalysisResult;
  implement: (analysis: AnalysisResult) => Implementation;
}
```

## Usage

This skill runs automatically when you describe features, integrations, or improvements you'd like to add to your project.
