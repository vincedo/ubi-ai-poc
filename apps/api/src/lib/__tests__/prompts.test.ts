import { describe, it, expect } from 'vitest';
import { getChatSystemPrompt, getEnrichmentPrompt } from '../prompts.js';

describe('getChatSystemPrompt', () => {
  it('returns a string for each prompt level', () => {
    expect(typeof getChatSystemPrompt('minimal', 'ctx')).toBe('string');
    expect(typeof getChatSystemPrompt('average', 'ctx')).toBe('string');
    expect(typeof getChatSystemPrompt('optimized', 'ctx')).toBe('string');
  });

  it('embeds the context into the returned prompt', () => {
    const context = 'This is the RAG context.';
    expect(getChatSystemPrompt('minimal', context)).toContain(context);
    expect(getChatSystemPrompt('average', context)).toContain(context);
    expect(getChatSystemPrompt('optimized', context)).toContain(context);
  });

  it('minimal prompt is shorter than optimized', () => {
    const ctx = 'ctx';
    expect(getChatSystemPrompt('minimal', ctx).length).toBeLessThan(
      getChatSystemPrompt('optimized', ctx).length,
    );
  });

  it('optimized prompt includes citation and fallback instructions', () => {
    const prompt = getChatSystemPrompt('optimized', 'ctx');
    expect(prompt).toContain("I don't have enough information");
    expect(prompt).toContain('cite the source');
  });

  it('empty context is embedded without error', () => {
    expect(() => getChatSystemPrompt('minimal', '')).not.toThrow();
    expect(getChatSystemPrompt('minimal', '')).toContain('Context:');
  });
});

describe('getEnrichmentPrompt', () => {
  it('returns a string for each prompt level', () => {
    expect(typeof getEnrichmentPrompt('minimal', 'transcript')).toBe('string');
    expect(typeof getEnrichmentPrompt('average', 'transcript')).toBe('string');
    expect(typeof getEnrichmentPrompt('optimized', 'transcript')).toBe('string');
  });

  it('embeds the transcript into the returned prompt', () => {
    const transcript = 'Hello world, this is a lecture.';
    expect(getEnrichmentPrompt('minimal', transcript)).toContain(transcript);
    expect(getEnrichmentPrompt('average', transcript)).toContain(transcript);
    expect(getEnrichmentPrompt('optimized', transcript)).toContain(transcript);
  });

  it('average and optimized prompts include MCQ requirements', () => {
    expect(getEnrichmentPrompt('average', 't')).toContain('MCQ');
    expect(getEnrichmentPrompt('optimized', 't')).toContain('MCQ');
  });

  it('optimized prompt includes example MCQ', () => {
    const prompt = getEnrichmentPrompt('optimized', 't');
    expect(prompt).toContain('Example MCQ');
  });

  it('empty transcript is embedded without error', () => {
    expect(() => getEnrichmentPrompt('minimal', '')).not.toThrow();
  });
});
