import {
  Student,
  Competence,
  Result,
  FluenceScore,
  FluenceReference,
  CurriculumItem,
  CurriculumResult
} from '../types';
import { getCode, getGrade, getDomain } from './helpers';
import { getEvaluatedCompetenceMap, EvaluatedCompetenceInfo } from './bilanGenerator';

export interface ApcCompetenceNeed {
  competence: Competence;
  code: string;
  title: string;
  domain: string;
  subDomain: string;
  score: number;
  cohortAvg: number;
  priority: 'urgent' | 'consolidate'; // urgent: < 3, consolidate: 3-4
  gapToCohort: number;
}

export interface ApcFluenceNeed {
  period: number;
  score: number;
  target: number;
  gap: number;
  errorsCount: number;
}

export interface ApcCurriculumSuggestion {
  item: CurriculumItem;
  score: number; // 0, 1 or 2
}

export interface StudentApcPlan {
  student: Student;
  evaluatedCount: number;
  masteredCount: number;
  urgentNeeds: ApcCompetenceNeed[];
  consolidateNeeds: ApcCompetenceNeed[];
  fluenceNeed: ApcFluenceNeed | null;
  curriculumSuggestions: ApcCurriculumSuggestion[];
  isAllMastered: boolean;
}

export interface WorkshopCompetenceSuggestion {
  competence: Competence;
  code: string;
  cleanTitle: string;
  grade: string;
  domain: string;
  subDomain: string;
  cohortAvg: number;
  urgentStudents: Array<{ student: Student; score: number }>;
  consolidateStudents: Array<{ student: Student; score: number }>;
  masteredStudents: Array<{ student: Student; score: number }>;
  neStudents: Student[];
  needCount: number;
  priorityScore: number;
}

export interface WorkshopThemeSuggestion {
  key: string;
  domain: string;
  subDomain: string;
  impactedStudents: Array<{
    student: Student;
    lowestScore: number;
    priority: 'urgent' | 'consolidate';
    codes: string[];
  }>;
  urgentCount: number;
  consolidateCount: number;
  totalImpacted: number;
  priorityScore: number;
}

export interface ApcRecommendationReport {
  studentPlans: StudentApcPlan[];
  workshopByCompetence: WorkshopCompetenceSuggestion[];
  workshopByTheme: WorkshopThemeSuggestion[];
  fluenceWorkshopStudents: Array<{ student: Student; need: ApcFluenceNeed }>;
}

function cleanCompetenceTitle(title: string): string {
  if (!title) return '';
  if (title.includes(' : ')) {
    return title.split(' : ').slice(1).join(' : ').trim();
  }
  return title.trim();
}

export function buildApcRecommendations(
  selectedStudents: Student[],
  activeStudents: Student[],
  competences: Competence[],
  results: Record<string, Record<number, Result>>,
  fluenceScores: FluenceScore[],
  fluenceReferences: FluenceReference[],
  curriculumItems: CurriculumItem[],
  curriculumResults: CurriculumResult[],
  domainFilter: string = 'all',
  precomputedEvaluatedMap?: Map<number, EvaluatedCompetenceInfo>
): ApcRecommendationReport {
  if (selectedStudents.length === 0) {
    return {
      studentPlans: [],
      workshopByCompetence: [],
      workshopByTheme: [],
      fluenceWorkshopStudents: []
    };
  }

  const evaluatedMap =
    precomputedEvaluatedMap || getEvaluatedCompetenceMap(activeStudents, competences, results);

  const filteredCompetences = competences.filter(c => {
    if (!evaluatedMap.has(c.id)) return false;
    if (domainFilter !== 'all' && getDomain(c) !== domainFilter) return false;
    return true;
  });

  // 1. Plans individuels par élève volontaire
  const studentPlans: StudentApcPlan[] = selectedStudents.map(student => {
    const gradeComps = filteredCompetences.filter(c => getGrade(c) === student.grade);

    let evaluatedCount = 0;
    let masteredCount = 0;
    const urgentNeeds: ApcCompetenceNeed[] = [];
    const consolidateNeeds: ApcCompetenceNeed[] = [];

    gradeComps.forEach(comp => {
      const res = results[student.id]?.[comp.id];
      if (!res || !res.isStarted || res.score === null || res.score === undefined) return;

      evaluatedCount++;
      const score = Number(res.score);
      if (score >= 5) {
        masteredCount++;
        return;
      }

      const cohortAvg = evaluatedMap.get(comp.id)?.cohortAvg ?? 0;
      const need: ApcCompetenceNeed = {
        competence: comp,
        code: getCode(comp),
        title: cleanCompetenceTitle(comp.title),
        domain: getDomain(comp) || 'Sans domaine',
        subDomain: (comp.subDomain || '').trim() || 'Général',
        score,
        cohortAvg,
        priority: score < 3 ? 'urgent' : 'consolidate',
        gapToCohort: cohortAvg - score
      };

      if (score < 3) urgentNeeds.push(need);
      else consolidateNeeds.push(need);
    });

    // Trier les besoins urgents : score le plus bas d'abord, puis plus fort retard par rapport à la classe
    urgentNeeds.sort((a, b) => {
      if (a.score !== b.score) return a.score - b.score;
      return b.gapToCohort - a.gapToCohort;
    });

    // Trier les consolidations (3-4) : 4 en premier car à 1 point du palier 5, puis 3
    consolidateNeeds.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.gapToCohort - a.gapToCohort;
    });

    // Vérifier la Fluence (dernière période enregistrée)
    let fluenceNeed: ApcFluenceNeed | null = null;
    const stFluence = fluenceScores
      .filter(s => {
        const sid = s.studentId || (s as any).studentid;
        return sid === student.id && s.score !== null && s.score !== undefined && (s.score as any) !== '';
      })
      .sort((a, b) => Number(a.period) - Number(b.period));

    if (stFluence.length > 0) {
      const latest = stFluence[stFluence.length - 1];
      const latestScore = Number(latest.score);
      const ref = fluenceReferences.find(
        r => r.grade === student.grade && Number(r.period) === Number(latest.period)
      );
      if (ref && Number(ref.target_score) > 0 && latestScore < Number(ref.target_score)) {
        fluenceNeed = {
          period: Number(latest.period),
          score: latestScore,
          target: Number(ref.target_score),
          gap: Number(ref.target_score) - latestScore,
          errorsCount: Number(latest.errors_count || 0)
        };
      }
    }

    // Propositions de perfectionnement (Curriculum < 3 points)
    const currScoreMap = new Map<number, number>();
    curriculumResults.forEach(r => {
      if (r.studentId === student.id) {
        currScoreMap.set(r.curriculumId, r.score);
      }
    });

    const curriculumSuggestions: ApcCurriculumSuggestion[] = curriculumItems
      .filter(item => {
        if (item.grade !== student.grade) return false;
        if (domainFilter !== 'all' && item.domain !== domainFilter) return false;
        const sc = currScoreMap.get(item.id) ?? 0;
        return sc < 3;
      })
      .map(item => ({
        item,
        score: currScoreMap.get(item.id) ?? 0
      }))
      // Prioriser ce qui est déjà amorcé (2 puis 1 puis 0) pour aller au bout, puis ordre du curriculum
      .sort((a, b) => b.score - a.score)
      .slice(0, 4);

    const isAllMastered =
      evaluatedCount > 0 && urgentNeeds.length === 0 && consolidateNeeds.length === 0;

    return {
      student,
      evaluatedCount,
      masteredCount,
      urgentNeeds,
      consolidateNeeds,
      fluenceNeed,
      curriculumSuggestions,
      isAllMastered
    };
  });

  // 2. Propositions d'ateliers communs par compétence exacte
  const workshopByCompetence: WorkshopCompetenceSuggestion[] = [];
  const selectedGrades = new Set(selectedStudents.map(s => s.grade));

  filteredCompetences.forEach(comp => {
    const grade = getGrade(comp);
    if (!selectedGrades.has(grade)) return;

    const cohortStudents = selectedStudents.filter(s => s.grade === grade);
    const urgentStudents: Array<{ student: Student; score: number }> = [];
    const consolidateStudents: Array<{ student: Student; score: number }> = [];
    const masteredStudents: Array<{ student: Student; score: number }> = [];
    const neStudents: Student[] = [];

    cohortStudents.forEach(st => {
      const res = results[st.id]?.[comp.id];
      if (!res || !res.isStarted || res.score === null || res.score === undefined) {
        neStudents.push(st);
        return;
      }
      const sc = Number(res.score);
      if (sc < 3) urgentStudents.push({ student: st, score: sc });
      else if (sc < 5) consolidateStudents.push({ student: st, score: sc });
      else masteredStudents.push({ student: st, score: sc });
    });

    const needCount = urgentStudents.length + consolidateStudents.length;
    if (needCount === 0) return;

    const cohortAvg = evaluatedMap.get(comp.id)?.cohortAvg ?? 0;
    const priorityScore = urgentStudents.length * 3 + consolidateStudents.length * 1.5;

    workshopByCompetence.push({
      competence: comp,
      code: getCode(comp),
      cleanTitle: cleanCompetenceTitle(comp.title),
      grade,
      domain: getDomain(comp) || 'Sans domaine',
      subDomain: (comp.subDomain || '').trim() || 'Général',
      cohortAvg,
      urgentStudents: urgentStudents.sort((a, b) => a.score - b.score),
      consolidateStudents: consolidateStudents.sort((a, b) => b.score - a.score),
      masteredStudents,
      neStudents,
      needCount,
      priorityScore
    });
  });

  workshopByCompetence.sort((a, b) => {
    if (b.priorityScore !== a.priorityScore) return b.priorityScore - a.priorityScore;
    if (b.needCount !== a.needCount) return b.needCount - a.needCount;
    return a.cohortAvg - b.cohortAvg;
  });

  // 3. Regroupement multi-niveaux par thème (Domaine + Sous-domaine)
  const themeMap = new Map<
    string,
    {
      domain: string;
      subDomain: string;
      studentMap: Map<string, { student: Student; lowestScore: number; codes: Set<string> }>;
    }
  >();

  studentPlans.forEach(plan => {
    const allNeeds = [...plan.urgentNeeds, ...plan.consolidateNeeds];
    allNeeds.forEach(need => {
      const key = `${need.domain}|||${need.subDomain}`;
      let entry = themeMap.get(key);
      if (!entry) {
        entry = {
          domain: need.domain,
          subDomain: need.subDomain,
          studentMap: new Map()
        };
        themeMap.set(key, entry);
      }
      const existing = entry.studentMap.get(plan.student.id);
      if (!existing) {
        entry.studentMap.set(plan.student.id, {
          student: plan.student,
          lowestScore: need.score,
          codes: new Set([need.code])
        });
      } else {
        existing.lowestScore = Math.min(existing.lowestScore, need.score);
        existing.codes.add(need.code);
      }
    });
  });

  const workshopByTheme: WorkshopThemeSuggestion[] = Array.from(themeMap.entries())
    .map(([key, entry]) => {
      const impactedStudents = Array.from(entry.studentMap.values())
        .map(item => ({
          student: item.student,
          lowestScore: item.lowestScore,
          priority: (item.lowestScore < 3 ? 'urgent' : 'consolidate') as 'urgent' | 'consolidate',
          codes: Array.from(item.codes)
        }))
        .sort((a, b) => a.lowestScore - b.lowestScore);

      const urgentCount = impactedStudents.filter(s => s.priority === 'urgent').length;
      const consolidateCount = impactedStudents.filter(s => s.priority === 'consolidate').length;

      return {
        key,
        domain: entry.domain,
        subDomain: entry.subDomain,
        impactedStudents,
        urgentCount,
        consolidateCount,
        totalImpacted: impactedStudents.length,
        priorityScore: urgentCount * 3 + consolidateCount * 1.5
      };
    })
    .sort((a, b) => {
      if (b.totalImpacted !== a.totalImpacted) return b.totalImpacted - a.totalImpacted;
      return b.priorityScore - a.priorityScore;
    });

  const fluenceWorkshopStudents = studentPlans
    .filter((p): p is StudentApcPlan & { fluenceNeed: ApcFluenceNeed } => p.fluenceNeed !== null)
    .map(p => ({ student: p.student, need: p.fluenceNeed }))
    .sort((a, b) => b.need.gap - a.need.gap);

  return {
    studentPlans,
    workshopByCompetence,
    workshopByTheme,
    fluenceWorkshopStudents
  };
}
