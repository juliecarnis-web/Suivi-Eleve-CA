import { Student, Competence, Result } from '../types';
import { getCode, getDomain, getGrade } from './helpers';
import { getEvaluatedCompetenceMap, EvaluatedCompetenceInfo } from './bilanGenerator';

export interface WeightedChapterOption {
  competence: Competence;
  code: string;
  title: string;
  domain: string;
  subDomain: string;
  score: number | null;
  pct: number;
  isValidated: boolean;
  isEvaluatedForStudent: boolean;
}

export interface WeightedSubDomainGroup {
  key: string;
  domain: string;
  subDomain: string;
  totalChaptersInLevel: number;
  evaluatedByStudentCount: number;
  needCount: number;
  subDomainAvgPct: number;
  weightScore: number;
  chapters: WeightedChapterOption[];
}

export function cleanChapterTitle(title: string): string {
  if (!title) return '';
  if (title.includes(' : ')) {
    return title.split(' : ').slice(1).join(' : ').trim();
  }
  return title.trim();
}

export function computeChapterMasteryPct(score: number | null | undefined): number {
  if (score === null || score === undefined || isNaN(Number(score))) return 0;
  return Math.min(100, Math.max(0, Math.round((Number(score) / 5) * 100)));
}

/**
 * Construit les groupes de sous-domaines pondérés par leur poids relatif dans le niveau
 * (nombre total de chapitres dans le sous-domaine) et les besoins de l'élève (< 5, hors NE).
 */
export function buildWeightedSubDomainPriorities(
  student: Student,
  activeStudents: Student[],
  competences: Competence[],
  results: Record<string, Record<number, Result>>,
  checkedCompetenceIds: Set<number>,
  precomputedEvaluatedMap?: Map<number, EvaluatedCompetenceInfo>
): WeightedSubDomainGroup[] {
  const evaluatedMap =
    precomputedEvaluatedMap || getEvaluatedCompetenceMap(activeStudents, competences, results);

  const gradeComps = competences.filter(c => getGrade(c) === student.grade);

  // Poids total de chaque couple (domain, subDomain) dans le niveau de l'élève
  const levelWeightMap = new Map<string, number>();
  gradeComps.forEach(c => {
    const domain = getDomain(c) || 'Sans domaine';
    const subDomain = (c.subDomain || '').trim() || 'Général';
    const key = `${domain}:::${subDomain}`;
    levelWeightMap.set(key, (levelWeightMap.get(key) || 0) + 1);
  });

  const groupMap = new Map<
    string,
    {
      domain: string;
      subDomain: string;
      chapters: WeightedChapterOption[];
      evaluatedScores: number[];
      needCount: number;
    }
  >();

  gradeComps.forEach(comp => {
    const res = results[student.id]?.[comp.id];
    const isChecked = checkedCompetenceIds.has(comp.id);
    const hasValidScore = Boolean(
      res && res.isStarted && res.score !== null && res.score !== undefined
    );
    const isCohortEvaluated = evaluatedMap.has(comp.id);

    // Exclure les chapitres NE ou non ouverts, sauf s'ils ont déjà été cochés précédemment (pour permettre de les décocher)
    if (!isChecked && (!isCohortEvaluated || !hasValidScore)) return;

    const score = hasValidScore ? Number(res!.score) : null;
    const isValidated = score !== null && score >= 5;

    // On affiche en priorité les chapitres non validés (< 5), et ceux déjà cochés (même s'ils viennent d'être validés)
    if (!isChecked && isValidated) return;

    const domain = getDomain(comp) || 'Sans domaine';
    const subDomain = (comp.subDomain || '').trim() || 'Général';
    const key = `${domain}:::${subDomain}`;

    let group = groupMap.get(key);
    if (!group) {
      group = {
        domain,
        subDomain,
        chapters: [],
        evaluatedScores: [],
        needCount: 0
      };
      groupMap.set(key, group);
    }

    if (score !== null) {
      group.evaluatedScores.push(score);
      if (score < 5) group.needCount += 1;
    }

    group.chapters.push({
      competence: comp,
      code: getCode(comp),
      title: cleanChapterTitle(comp.title),
      domain,
      subDomain,
      score,
      pct: computeChapterMasteryPct(score),
      isValidated,
      isEvaluatedForStudent: score !== null
    });
  });

  return Array.from(groupMap.entries())
    .map(([key, g]) => {
      const totalChaptersInLevel = levelWeightMap.get(key) || g.chapters.length;
      const avgScore =
        g.evaluatedScores.length > 0
          ? g.evaluatedScores.reduce((acc, s) => acc + s, 0) / g.evaluatedScores.length
          : 5;
      const subDomainAvgPct = computeChapterMasteryPct(avgScore);
      const avgGapTo5 = Math.max(0, 5 - avgScore);

      // Pondération : le poids du sous-domaine (nb de chapitres) domine, modulé par le besoin (< 5)
      const weightScore =
        (g.needCount > 0 ? 1000 : 0) +
        totalChaptersInLevel * (1 + avgGapTo5 * 0.25) +
        g.needCount * 0.5;

      const sortedChapters = [...g.chapters].sort((a, b) => {
        if (a.isValidated !== b.isValidated) return a.isValidated ? 1 : -1;
        const sa = a.score ?? 99;
        const sb = b.score ?? 99;
        if (sa !== sb) return sa - sb;
        return a.code.localeCompare(b.code, 'fr', { numeric: true });
      });

      return {
        key,
        domain: g.domain,
        subDomain: g.subDomain,
        totalChaptersInLevel,
        evaluatedByStudentCount: g.evaluatedScores.length,
        needCount: g.needCount,
        subDomainAvgPct,
        weightScore,
        chapters: sortedChapters
      };
    })
    .sort(
      (a, b) =>
        b.weightScore - a.weightScore ||
        b.totalChaptersInLevel - a.totalChaptersInLevel ||
        a.subDomain.localeCompare(b.subDomain, 'fr')
    );
}
