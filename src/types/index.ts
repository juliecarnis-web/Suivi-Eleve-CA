export type Student = {
  id: string;
  firstName: string;
  lastName: string;
  grade: string;
  isArchived: boolean;
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
  notes?: string;
  created_at?: string;
};

