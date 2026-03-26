import type { ProgressStatus, CompletedBy } from './models.js';

export interface ProgressChangeInput {
  studentId: string;
  stepId: number;
  status: ProgressStatus;
  note?: string | null;
  completedAt?: string;
  completedBy?: string;
}

export interface ProgressChangeResult {
  error?: string;
  result?: 'created' | 'updated' | 'noop';
  status?: ProgressStatus | 'not_completed';
  completedAt?: string | null;
  completedBy?: string;
}

export interface AuditEntry {
  entityType: string;
  entityId: string | number;
  action: string;
  details?: Record<string, unknown>;
}

export interface StudentResolutionSuccess {
  student: { id: string; display_name: string; email: string; emplid: string | null; term_id: number | null };
  studentIdNumber: string;
  errorCode?: undefined;
  error?: undefined;
}

export interface StudentResolutionError {
  errorCode: string;
  error: string;
  student?: undefined;
  studentIdNumber?: undefined;
}

export type StudentResolution = StudentResolutionSuccess | StudentResolutionError;

export interface StepResolutionSuccess {
  step: { id: number; title: string; term_id: number; step_key: string; is_active: number };
  stepKey: string;
  errorCode?: undefined;
  error?: undefined;
}

export interface StepResolutionError {
  errorCode: string;
  error: string;
  step?: undefined;
  stepKey?: undefined;
}

export type StepResolution = StepResolutionSuccess | StepResolutionError;
