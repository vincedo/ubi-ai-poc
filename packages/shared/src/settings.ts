// --- Types ---

export interface SettingOption<T> {
  value: T;
  label: string;
  description: string;
}

export interface SettingDefinition<T = unknown> {
  key: keyof SettingsValues;
  label: string;
  category: 'chunking' | 'retrieval' | 'embedding';
  type: 'number' | 'string' | 'boolean';
  defaultValue: T;
  requiresReingestion: boolean;
  options?: SettingOption<T>[];
  description?: string;
}

export interface SettingsValues {
  chunkSize: number;
  chunkOverlap: number;
  sentenceAwareSplitting: boolean;
  topK: number;
  embeddingModel: string;
  distanceMetric: string;
}

export interface EmbeddingModelConfig {
  id: string;
  provider: 'mistral' | 'openai';
  dimensions: number;
}

// --- Constants ---

export const EMBEDDING_MODELS: Record<string, EmbeddingModelConfig> = {
  'mistral-embed': { id: 'mistral-embed', provider: 'mistral', dimensions: 1024 },
  'text-embedding-3-small': { id: 'text-embedding-3-small', provider: 'openai', dimensions: 1536 },
  'text-embedding-3-large': { id: 'text-embedding-3-large', provider: 'openai', dimensions: 3072 },
};

export const DEFAULT_SETTINGS: SettingsValues = {
  chunkSize: 2000,
  chunkOverlap: 400,
  sentenceAwareSplitting: false,
  topK: 5,
  embeddingModel: 'mistral-embed',
  distanceMetric: 'Cosine',
};

export const SETTINGS_DEFINITIONS: SettingDefinition[] = [
  // --- Chunking ---
  {
    key: 'chunkSize',
    label: 'Chunk Size',
    category: 'chunking',
    type: 'number',
    defaultValue: 2000,
    requiresReingestion: true,
    description: 'Controls how much text goes into each chunk before embedding.',
    options: [
      {
        value: 500,
        label: 'Small (500 chars)',
        description:
          'More precise retrieval, but chunks may lack context. Good for short, factual content.',
      },
      {
        value: 2000,
        label: 'Medium (2000 chars)',
        description:
          'Balanced trade-off between precision and context. Works well for most content.',
      },
      {
        value: 5000,
        label: 'Large (5000 chars)',
        description:
          'Chunks retain more context, but may mix topics and dilute retrieval relevance.',
      },
    ],
  },
  {
    key: 'chunkOverlap',
    label: 'Chunk Overlap',
    category: 'chunking',
    type: 'number',
    defaultValue: 400,
    requiresReingestion: true,
    description: 'How much text is shared between consecutive chunks.',
    options: [
      {
        value: 0,
        label: 'None',
        description:
          'No overlap between chunks. Fastest, but risks splitting sentences at boundaries.',
      },
      {
        value: 200,
        label: 'Small (200 chars)',
        description: 'Minimal overlap. Reduces boundary issues with lower redundancy.',
      },
      {
        value: 400,
        label: 'Large (400 chars)',
        description:
          'More overlap preserves context across chunk boundaries, at the cost of more embeddings.',
      },
    ],
  },
  {
    key: 'sentenceAwareSplitting',
    label: 'Sentence-Aware Splitting',
    category: 'chunking',
    type: 'boolean',
    defaultValue: false,
    requiresReingestion: true,
    description: 'Whether to adjust chunk boundaries to align with sentence endings.',
    options: [
      {
        value: false,
        label: 'Off',
        description: 'Splits at exact character count. Simple but may cut mid-sentence.',
      },
      {
        value: true,
        label: 'On',
        description:
          'Adjusts boundaries to the nearest sentence end. Produces more coherent chunks.',
      },
    ],
  },
  // --- Retrieval ---
  {
    key: 'topK',
    label: 'Top-K',
    category: 'retrieval',
    type: 'number',
    defaultValue: 5,
    requiresReingestion: false,
    description: 'How many chunks are retrieved from the vector store for each query.',
    options: [
      {
        value: 3,
        label: 'Few (3)',
        description: 'Fewer but more relevant chunks. Less noise, but may miss useful context.',
      },
      {
        value: 5,
        label: 'Standard (5)',
        description: 'Good balance of relevance and coverage for most use cases.',
      },
      {
        value: 10,
        label: 'Many (10)',
        description:
          'Casts a wider net. More context for the LLM, but may include less relevant chunks.',
      },
    ],
  },
  // --- Embedding ---
  {
    key: 'embeddingModel',
    label: 'Embedding Model',
    category: 'embedding',
    type: 'string',
    defaultValue: 'mistral-embed',
    requiresReingestion: true,
    description: 'The model used to convert text into vector embeddings.',
    options: [
      {
        value: 'mistral-embed',
        label: 'Mistral Embed',
        description: 'Default model. Good quality, 1024 dimensions.',
      },
      {
        value: 'text-embedding-3-small',
        label: 'OpenAI Small',
        description: 'Higher dimensions than Mistral (1536). Good quality/cost ratio.',
      },
      {
        value: 'text-embedding-3-large',
        label: 'OpenAI Large',
        description: 'Highest dimensions (3072). Best quality but slower and more expensive.',
      },
    ],
  },
  {
    key: 'distanceMetric',
    label: 'Distance Metric',
    category: 'embedding',
    type: 'string',
    defaultValue: 'Cosine',
    requiresReingestion: true,
    description: 'How similarity between embeddings is calculated during retrieval.',
    options: [
      {
        value: 'Cosine',
        label: 'Cosine',
        description:
          'Measures angle between vectors. Most common, works well for normalized embeddings.',
      },
      {
        value: 'Euclid',
        label: 'Euclidean',
        description: 'Measures straight-line distance. Sensitive to vector magnitude.',
      },
      {
        value: 'Dot',
        label: 'Dot Product',
        description:
          'Measures alignment and magnitude. Fast, but requires normalized vectors for fair comparison.',
      },
    ],
  },
];
