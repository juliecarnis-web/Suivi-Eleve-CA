import { Competence, Result, Student } from '../types';
import { getCode, getDomain, getGrade } from './helpers';

export type ExpertTier = 'expert_5' | 'expert_over_5';

export interface ChapterExpertEntry {
  student: Student;
  competence: Competence;
  code: string;
  title: string;
  domain: string;
  subDomain: string;
  grade: string;
  score: number;
  tier: ExpertTier;
}

export function cleanChapterLabel(title: string): string {
  if (!title) return '';
  if (title.includes(' : ')) {
    return title.split(' : ').slice(1).join(' : ').trim();
  }
  return title.trim();
}

export function getExpertTier(score: number | null | undefined): ExpertTier | null {
  if (score === null || score === undefined || isNaN(Number(score))) return null;
  const numeric = Number(score);
  if (numeric > 5) return 'expert_over_5';
  if (numeric === 5) return 'expert_5';
  return null;
}

export function getStudentExpertChapters(
  student: Student,
  competences: Competence[],
  results: Record<string, Record<number, Result>>
): ChapterExpertEntry[] {
  const entries: ChapterExpertEntry[] = [];

  competences.forEach(comp => {
    if (getGrade(comp) !== student.grade) return;
    const res = results[student.id]?.[comp.id];
    if (!res || !res.isStarted || res.score === null || res.score === undefined) return;
    const score = Number(res.score);
    const tier = getExpertTier(score);
    if (!tier) return;

    entries.push({
      student,
      competence: comp,
      code: getCode(comp),
      title: cleanChapterLabel(comp.title),
      domain: getDomain(comp) || 'Sans domaine',
      subDomain: (comp.subDomain || '').trim() || 'Général',
      grade: getGrade(comp),
      score,
      tier
    });
  });

  return entries.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier === 'expert_over_5' ? -1 : 1;
    if (b.score !== a.score) return b.score - a.score;
    return a.code.localeCompare(b.code, 'fr', { numeric: true });
  });
}

export function getAllChapterExperts(
  activeStudents: Student[],
  competences: Competence[],
  results: Record<string, Record<number, Result>>
): ChapterExpertEntry[] {
  const entries: ChapterExpertEntry[] = [];
  activeStudents.forEach(student => {
    entries.push(...getStudentExpertChapters(student, competences, results));
  });
  return entries;
}
