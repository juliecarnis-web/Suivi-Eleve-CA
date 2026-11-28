export type Student = {
  id: string;
  firstName: string;
  lastName: string;
  grade: string;
  isArchived: boolean;
  apc_authorized?: boolean;
};

export type Competence = {
  id: number;
  code?: string;
  domain?: string;
  subDomain?: string;
  title: string;
  grade?: string;
};

export type Result = {
  studentId: string;
  competenceId: number;
  score: number | null;
  isStarted: boolean;
};

export type FluenceScore = {
  id?: string;
  studentId: string;
  date?: string;
  score: number;
  errors_count?: number;
  period: number;
  text_title?: string;
  teacher_id?: string;
};

export type FluenceReference = {
  id?: string;
  grade: string;
  period: number;
  target_score: number;
  teacher_id?: string;
};

export type CurriculumItem = {
  id: number;
  code: string;
  domain: string;
  subDomain?: string;
  title: string;
  grade: string;
  teacher_id?: string;
};

export type CurriculumResult = {
  id: string;
  studentId: string;
  curriculumId: number;
  evaluationNum: number; // 1, 2 or 3
  score: number; // 0, 1, 2 or 3
  grade: string;
  updatedAt?: string;
  teacher_id?: string;
};

export type ApcFocusType = 'competence' | 'theme' | 'fluence' | 'curriculum' | 'custom';
export type ApcModality = 'individuel' | 'autonomie';

export type ApcEntry = {
  id: string;
  session_id: string;
  session_date: string; // YYYY-MM-DD
  student_id: string;
  competence_id: number | null;
  chapter_code: string;
  chapter_title: string;
  domain: string;
  sub_domain: string;
  focus_type: ApcFocusType;
  modality?: ApcModality;
  notes?: string;
  created_at?: string;
};

export type ParentPriorityEntry = {
  id: string;
  student_id: string;
  competence_id: number;
  updated_at?: string;
};

export type AbsencePeriodConfig = {
  period: number; // 1..5
  label: string;
  start: string; // YYYY-MM-DD
  end: string;   // YYYY-MM-DD
};

export type AbsenceClosureScope = 'full' | 'AM' | 'PM';

export type AbsenceClosure = {
  id: string;
  date: string; // YYYY-MM-DD
  label: string;
  scope: AbsenceClosureScope;
};

export type AbsenceWeekDays = 4 | 4.5;
export type AbsenceHalfDaySlot = 'wednesday_am' | 'saturday_am';

export type AbsenceConfig = {
  id?: string;
  school_year: string; // e.g. '2026-2027'
  teacher_name?: string;
  week_days: AbsenceWeekDays;
  half_day_slot: AbsenceHalfDaySlot;
  periods: AbsencePeriodConfig[];
  custom_closures: AbsenceClosure[];
  excluded_auto_holidays: string[];
  segment_headcounts: Record<string, number>;
  updated_at?: string;
};

export type StudentAbsenceRecord = {
  id: string;
  school_year: string;
  period: number; // 1..5
  month_key: string; // YYYY-MM or 'ALL'
  start_date: string; // YYYY-MM-DD
  end_date: string;   // YYYY-MM-DD
  student_id: string;
  absent_half_days: number;
  justified_half_days: number;
  notes?: string;
  updated_at?: string;
};
