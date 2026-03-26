// Database row types matching the SQL schema in server/db/init.js

export interface Student {
  id: string;
  display_name: string;
  email: string;
  azure_id: string | null;
  tags: string | null;
  emplid: string | null;
  preferred_name: string | null;
  phone: string | null;
  applicant_type: string | null;
  major: string | null;
  residency: string | null;
  admit_term: string | null;
  term_id: number | null;
  last_synced_at: string | null;
  last_api_check_at: string | null;
  created_at: string;
}

export interface Step {
  id: number;
  title: string;
  description: string | null;
  icon: string | null;
  sort_order: number;
  deadline: string | null;
  guide_content: string | null;
  links: string | null;
  required_tags: string | null;
  excluded_tags: string | null;
  required_tag_mode: 'any' | 'all';
  contact_info: string | null;
  term_id: number;
  deadline_date: string | null;
  is_public: number;
  step_key: string;
  is_optional: number;
  is_active: number;
  created_at: string;
}

export type ProgressStatus = 'completed' | 'waived' | 'not_completed';
export type CompletedBy = 'manual' | 'integration' | 'api_check' | 'auto';

export interface StudentProgress {
  student_id: string;
  step_id: number;
  completed_at: string | null;
  status: ProgressStatus;
  note: string | null;
  completed_by: string;
}

export type AdminRole = 'sysadmin' | 'admissions_editor' | 'admissions' | 'viewer';

export interface AdminUser {
  id: number;
  email: string;
  password_hash: string;
  role: AdminRole;
  display_name: string;
  is_active: number;
  azure_id: string | null;
  created_at: string;
}

export interface Term {
  id: number;
  name: string;
  start_date: string | null;
  end_date: string | null;
  is_active: number;
  created_at: string;
}

export interface AuditLogEntry {
  id: number;
  entity_type: string;
  entity_id: string;
  action: string;
  changed_by: string;
  details: string | null;
  created_at: string;
}

export interface IntegrationClient {
  id: number;
  name: string;
  key_hash: string;
  is_active: number;
  created_at: string;
}

export interface IntegrationEvent {
  id: number;
  integration_client_id: number;
  source_event_id: string;
  student_id_number: string | null;
  step_key: string | null;
  request_body: string | null;
  response_status: number;
  response_body: string;
  created_at: string;
}

export interface StepApiCheck {
  id: number;
  step_id: number;
  is_enabled: boolean;
  http_method: string;
  url: string;
  auth_type: string | null;
  auth_credentials: string | null;
  headers: string | null;
  student_param_name: string;
  student_param_source: string;
  response_field_path: string;
  created_at: string;
  updated_at: string;
}
