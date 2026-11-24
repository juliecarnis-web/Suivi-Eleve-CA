import {
  Student,
  Competence,
  Result,
  CurriculumItem,
  CurriculumResult
} from '../types';
import { getCode, getGrade, getDomain } from './helpers';
import { getEvaluatedCompetenceMap, EvaluatedCompetenceInfo } from './bilanGenerator';

export interface AutonomieCompetenceItem {
  competence: Competence;
  code: string;
  title: string;
  domain: string;
  subDomain: string;
  grade: string;
  score: number;
  cohortAvg: number;
  mode: 'solo' | 'tutor';
}

export interface ExpertCandidate {
  student: Student;
  score: number;
  isSameGrade: boolean;
  isSelectedInSession: boolean;
  matchedCode: string;
  matchedTitle: string;
}

export interface StudentAutonomieProfile {
  student: Student;
  soloChapters: AutonomieCompetenceItem[];
  blockingChapters: AutonomieCompetenceItem[];
  evaluatedCount: number;
  masteredCount: number;
  isAllMasteredInFilter: boolean;
  curriculumSuggestions: Array<{ item: CurriculumItem; score: number }>;
}

export type AutonomiePlanMode = 'solo' | 'tutor' | 'expert_helper' | 'curriculum';

export interface AutonomieAssignment {
  mode: AutonomiePlanMode;
  competenceId: number | null;
  chapterCode: string;
  chapterTitle: string;
  domain: string;
  subDomain: string;
  currentScore: number | null;
  expertId: string | null;
}

function cleanTitle(title: string): string {
  if (!title) return '';
  if (title.includes(' : ')) {
    return title.split(' : ').slice(1).join(' : ').trim();
  }
  return title.trim();
}

export function buildAutonomieProfiles(
  selectedStudents: Student[],
  activeStudents: Student[],
  competences: Competence[],
  results: Record<string, Record<number, Result>>,
  curriculumItems: CurriculumItem[],
  curriculumResults: CurriculumResult[],
  options: {
    domainFilter?: string;
    subDomainFilter?: string;
    soloMinScore?: 3 | 4;
  } = {},
  precomputedEvaluatedMap?: Map<number, EvaluatedCompetenceInfo>
): StudentAutonomieProfile[] {
  if (selectedStudents.length === 0) return [];

  const {
    domainFilter = 'all',
    subDomainFilter = 'all',
    soloMinScore = 4
  } = options;

  const evaluatedMap =
    precomputedEvaluatedMap || getEvaluatedCompetenceMap(activeStudents, competences, results);

  const filteredCompetences = competences.filter(c => {
    if (!evaluatedMap.has(c.id)) return false;
    if (domainFilter !== 'all' && getDomain(c) !== domainFilter) return false;
    if (subDomainFilter !== 'all') {
      const sd = (c.subDomain || '').trim() || 'Général';
      if (sd !== subDomainFilter) return false;
    }
    return true;
  });

  return selectedStudents.map(student => {
    const gradeComps = filteredCompetences.filter(c => getGrade(c) === student.grade);

    let evaluatedCount = 0;
    let masteredCount = 0;
    const soloChapters: AutonomieCompetenceItem[] = [];
    const blockingChapters: AutonomieCompetenceItem[] = [];

    gradeComps.forEach(comp => {
      const res = results[student.id]?.[comp.id];
      // Exclusion stricte des chapitres non ouverts ou NE (score === null / undefined)
      if (!res || !res.isStarted || res.score === null || res.score === undefined) return;

      evaluatedCount++;
      const score = Number(res.score);
      if (score >= 5) {
        masteredCount++;
        return;
      }

      const cohortAvg = evaluatedMap.get(comp.id)?.cohortAvg ?? 0;
      const baseItem = {
        competence: comp,
        code: getCode(comp),
        title: cleanTitle(comp.title),
        domain: getDomain(comp) || 'Sans domaine',
        subDomain: (comp.subDomain || '').trim() || 'Général',
        grade: getGrade(comp),
        score,
        cohortAvg
      };

      // Mieux réussis mais non validés (4/5, ou 3-4/5 si activé)
      if (score >= soloMinScore && score < 5) {
        soloChapters.push({ ...baseItem, mode: 'solo' });
      }

      // Chapitres bloquants entre 0 et 3 réussites
      if (score >= 0 && score <= 3) {
        blockingChapters.push({ ...baseItem, mode: 'tutor' });
      }
    });

    // En autonomie solo : priorité aux plus proches de 5 (4 d'abord, puis code)
    soloChapters.sort(
      (a, b) =>
        b.score - a.score ||
        b.cohortAvg - a.cohortAvg ||
        a.code.localeCompare(b.code, 'fr', { numeric: true })
    );

    // En blocage (0-3) : priorité aux plus bloquants (0 d'abord, ou plus gros écart classe)
    blockingChapters.sort(
      (a, b) =>
        a.score - b.score ||
        (b.cohortAvg - b.score) - (a.cohortAvg - a.score) ||
        a.code.localeCompare(b.code, 'fr', { numeric: true })
    );

    // Pistes curriculum si tout est validé
    const gradeCurrItems = curriculumItems.filter(item => {
      if (item.grade !== student.grade) return false;
      if (domainFilter !== 'all' && item.domain !== domainFilter) return false;
      if (subDomainFilter !== 'all' && (item.subDomain || 'Général') !== subDomainFilter) return false;
      return true;
    });

    const curriculumSuggestions: Array<{ item: CurriculumItem; score: number }> = [];
    gradeCurrItems.forEach(item => {
      const itemRes = curriculumResults
        .filter(r => r.studentId === student.id && r.curriculumId === item.id)
        .sort((a, b) => b.evaluationNum - a.evaluationNum);
      if (itemRes.length > 0 && itemRes[0].score < 3) {
        curriculumSuggestions.push({ item, score: itemRes[0].score });
      }
    });
    curriculumSuggestions.sort((a, b) => a.score - b.score);

    return {
      student,
      soloChapters,
      blockingChapters,
      evaluatedCount,
      masteredCount,
      isAllMasteredInFilter: evaluatedCount > 0 && soloChapters.length === 0 && blockingChapters.length === 0,
      curriculumSuggestions
    };
  });
}

export function findExpertsForChapter(
  chapter: {
    competenceId: number | null;
    grade: string;
    domain: string;
    subDomain: string;
    code: string;
    title: string;
  },
  learnerId: string,
  activeStudents: Student[],
  selectedIds: Set<string>,
  competences: Competence[],
  results: Record<string, Record<number, Result>>,
  allowCrossGrade: boolean = false
): ExpertCandidate[] {
  const candidates: ExpertCandidate[] = [];

  if (chapter.competenceId !== null) {
    activeStudents.forEach(st => {
      if (st.id === learnerId || st.grade !== chapter.grade) return;
      const res = results[st.id]?.[chapter.competenceId!];
      if (!res || !res.isStarted || res.score === null || res.score === undefined) return;
      if (Number(res.score) >= 5) {
        candidates.push({
          student: st,
          score: Number(res.score),
          isSameGrade: true,
          isSelectedInSession: selectedIds.has(st.id),
          matchedCode: chapter.code,
          matchedTitle: chapter.title
        });
      }
    });
  }

  // Option multi-niveaux : si demandé (ou aucun expert du même niveau), proposer des élèves d'un autre niveau maîtrisant le même sous-domaine
  if (allowCrossGrade) {
    const alreadyAdded = new Set(candidates.map(c => c.student.id));
    const sameThemeComps = competences.filter(c => {
      const d = getDomain(c) || 'Sans domaine';
      const sd = (c.subDomain || '').trim() || 'Général';
      return d === chapter.domain && sd === chapter.subDomain && getGrade(c) !== chapter.grade;
    });

    if (sameThemeComps.length > 0) {
      activeStudents.forEach(st => {
        if (st.id === learnerId || st.grade === chapter.grade || alreadyAdded.has(st.id)) return;
        const stComps = sameThemeComps.filter(c => getGrade(c) === st.grade);
        let bestMatch: { comp: Competence; score: number } | null = null;
        stComps.forEach(comp => {
          const res = results[st.id]?.[comp.id];
          if (!res || !res.isStarted || res.score === null || res.score === undefined) return;
          const s = Number(res.score);
          if (s >= 5 && (!bestMatch || s > bestMatch.score)) {
            bestMatch = { comp, score: s };
          }
        });
        if (bestMatch) {
          candidates.push({
            student: st,
            score: (bestMatch as { comp: Competence; score: number }).score,
            isSameGrade: false,
            isSelectedInSession: selectedIds.has(st.id),
            matchedCode: getCode((bestMatch as { comp: Competence; score: number }).comp),
            matchedTitle: cleanTitle((bestMatch as { comp: Competence; score: number }).comp.title)
          });
        }
      });
    }
  }

  // Tri : même niveau d'abord, présent dans la séance d'abord, score décroissant, prénom
  return candidates.sort((a, b) => {
    if (a.isSameGrade !== b.isSameGrade) return a.isSameGrade ? -1 : 1;
    if (a.isSelectedInSession !== b.isSelectedInSession) return a.isSelectedInSession ? -1 : 1;
    if (b.score !== a.score) return b.score - a.score;
    return a.student.firstName.localeCompare(b.student.firstName, 'fr');
  });
}

export function getDefaultAutonomieAssignment(
  profile: StudentAutonomieProfile,
  activeStudents: Student[],
  selectedIds: Set<string>,
  competences: Competence[],
  results: Record<string, Record<number, Result>>,
  allowCrossGrade: boolean
): AutonomieAssignment {
  // Priorité en autonomie : un chapitre à 4/5 qu'il peut valider seul sans blocage
  if (profile.soloChapters.length > 0) {
    const ch = profile.soloChapters[0];
    return {
      mode: 'solo',
      competenceId: ch.competence.id,
      chapterCode: ch.code,
      chapterTitle: ch.title,
      domain: ch.domain,
      subDomain: ch.subDomain,
      currentScore: ch.score,
      expertId: null
    };
  }

  // Sinon, si bloqué (0-3), lui proposer son chapitre prioritaire avec le meilleur expert disponible
  if (profile.blockingChapters.length > 0) {
    const ch = profile.blockingChapters[0];
    const experts = findExpertsForChapter(
      {
        competenceId: ch.competence.id,
        grade: ch.grade,
        domain: ch.domain,
        subDomain: ch.subDomain,
        code: ch.code,
        title: ch.title
      },
      profile.student.id,
      activeStudents,
      selectedIds,
      competences,
      results,
      allowCrossGrade
    );

    return {
      mode: 'tutor',
      competenceId: ch.competence.id,
      chapterCode: ch.code,
      chapterTitle: ch.title,
      domain: ch.domain,
      subDomain: ch.subDomain,
      currentScore: ch.score,
      expertId: experts[0]?.student.id ?? null
    };
  }

  if (profile.curriculumSuggestions.length > 0) {
    const topCurr = profile.curriculumSuggestions[0];
    return {
      mode: 'curriculum',
      competenceId: null,
      chapterCode: topCurr.item.code,
      chapterTitle: topCurr.item.title,
      domain: topCurr.item.domain,
      subDomain: topCurr.item.subDomain || '',
      currentScore: null,
      expertId: null
    };
  }

  return {
    mode: 'expert_helper',
    competenceId: null,
    chapterCode: 'EXPERT',
    chapterTitle: 'Élève expert(e) / Tutorat disponible',
    domain: 'Entraide',
    subDomain: '',
    currentScore: null,
    expertId: null
  };
}
