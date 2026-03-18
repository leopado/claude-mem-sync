export interface ProcessedFile {
  hash: string;
  processedAt: number;
  observationsCount: number;
}

export interface ProjectMergeState {
  processedFiles: Record<string, ProcessedFile>;
  totalObservations: number;
  cap: number;
  lastEvictionAt: number | null;
}

export interface MergeState {
  lastMergedAt: number;
  schemaVersion: number;
  projects: Record<string, ProjectMergeState>;
}
