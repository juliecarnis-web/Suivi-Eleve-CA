import {
  Student,
  Competence,
  Result,
  FluenceScore,
  FluenceReference,
  CurriculumItem,
  CurriculumResult
} from '../types';
import { getGrade, getDomain } from './helpers';

export type BilanStyle = 'lsu' | 'parents';

export interface BilanOptions {
  style: BilanStyle;
  includeNumbers: boolean;
  variant?: number; // 0, 1 ou 2 pour varier les tournures
}

export interface EvaluatedCompetenceInfo {
  id: number;
  cohortAvg: number;
}

export interface StudentBilanSummary {
  student: Student;
  evaluatedCount: number;
  rawAvg5: number | null; // moyenne brute (seuil vert = 5, bonus jusqu'à 10)
  cohortAvg5: number | null; // moyenne de la classe sur ces mêmes chapitres
  targetPct: number | null; // % d'atteinte du seuil de 5 (plafonné à 5 par compétence)
  strongDomains: { name: string; avg: number; cohortAvg: number }[];
  weakDomains: { name: string; avg: number; cohortAvg: number }[];
  fluenceLatest: { period: number; score: number; target: number | null } | null;
  fluenceDelta: number | null;
  curriculumPct: number | null;
  text: string;
}

/**
 * Formate "de <Prénom>" ou "d'<Prénom>" selon l'initiale
 */
function dePrenom(firstName: string): string {
  const clean = firstName.trim();
  if (!clean) return "de l'élève";
  const firstChar = clean[0].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (['a', 'e', 'i', 'o', 'u', 'y', 'h'].includes(firstChar)) {
    return `d'${clean}`;
  }
  return `de ${clean}`;
}

/**
 * Joint une liste de libellés en français naturel ("A", "A et B", "A, B et C")
 */
function joinFrenchList(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} et ${items[1]}`;
  return `${items.slice(0, -1).join(', ')} et ${items[items.length - 1]}`;
}

/**
 * Détermine les compétences effectivement évaluées pour chaque niveau :
 * - ignore les chapitres juste ouverts sans saisie (score null ou moyenne classe === 0)
 * - ignore un chapitre qui n'a qu'1 seule saisie isolée sur une cohorte >= 4 élèves (sauf si avg >= 0.5)
 */
export function getEvaluatedCompetenceMap(
  activeStudents: Student[],
  competences: Competence[],
  results: Record<string, Record<number, Result>>
): Map<number, EvaluatedCompetenceInfo> {
  const evaluatedMap = new Map<number, EvaluatedCompetenceInfo>();
  const studentsByGrade = new Map<string, Student[]>();

  activeStudents.forEach(s => {
    const arr = studentsByGrade.get(s.grade) || [];
    arr.push(s);
    studentsByGrade.set(s.grade, arr);
  });

  competences.forEach(comp => {
    const grade = getGrade(comp);
    const cohort = studentsByGrade.get(grade) || [];
    if (cohort.length === 0) return;

    let anyStarted = false;
    let sum = 0;
    let scoredCount = 0;
    let nonZeroCount = 0;

    cohort.forEach(st => {
      const res = results[st.id]?.[comp.id];
      if (res?.isStarted) anyStarted = true;
      if (res && res.isStarted && res.score !== null && res.score !== undefined) {
        const val = Number(res.score);
        if (!isNaN(val)) {
          sum += val;
          scoredCount++;
          if (val > 0) nonZeroCount++;
        }
      }
    });

    if (!anyStarted || scoredCount === 0) return;

    const cohortAvg = sum / scoredCount;
    const isMeaningful =
      cohortAvg > 0 &&
      (cohort.length < 4 || nonZeroCount >= 2 || cohortAvg >= 0.5);

    if (isMeaningful) {
      evaluatedMap.set(comp.id, { id: comp.id, cohortAvg });
    }
  });

  return evaluatedMap;
}

export function generateStudentBilan(
  student: Student,
  activeStudents: Student[],
  competences: Competence[],
  results: Record<string, Record<number, Result>>,
  fluenceScores: FluenceScore[],
  fluenceReferences: FluenceReference[],
  curriculumItems: CurriculumItem[],
  curriculumResults: CurriculumResult[],
  options: BilanOptions,
  precomputedEvaluatedMap?: Map<number, EvaluatedCompetenceInfo>
): StudentBilanSummary {
  const evaluatedMap =
    precomputedEvaluatedMap || getEvaluatedCompetenceMap(activeStudents, competences, results);

  const studentComps = competences.filter(c => {
    if (getGrade(c) !== student.grade) return false;
    if (!evaluatedMap.has(c.id)) return false;
    const res = results[student.id]?.[c.id];
    return Boolean(res && res.isStarted && res.score !== null && res.score !== undefined);
  });

  const domainStats = new Map<string, { studentSum: number; cohortSum: number; count: number }>();
  let totalStudentSum = 0;
  let totalCapped5Sum = 0;
  let totalCohortSum = 0;
  let totalCount = 0;

  studentComps.forEach(c => {
    const score = Number(results[student.id]?.[c.id]?.score ?? 0);
    const cohortAvg = evaluatedMap.get(c.id)?.cohortAvg ?? 0;

    totalStudentSum += score;
    totalCapped5Sum += Math.min(score, 5);
    totalCohortSum += cohortAvg;
    totalCount += 1;

    const label = getDomain(c) || c.subDomain || 'Autres';
    const current = domainStats.get(label) || { studentSum: 0, cohortSum: 0, count: 0 };
    current.studentSum += score;
    current.cohortSum += cohortAvg;
    current.count += 1;
    domainStats.set(label, current);
  });

  const rawAvg5 = totalCount > 0 ? Math.round((totalStudentSum / totalCount) * 10) / 10 : null;
  const cohortAvg5 = totalCount > 0 ? Math.round((totalCohortSum / totalCount) * 10) / 10 : null;
  const targetPct = totalCount > 0 ? Math.round((totalCapped5Sum / (totalCount * 5)) * 100) : null;
  const relativeDelta =
    rawAvg5 !== null && cohortAvg5 !== null ? rawAvg5 - cohortAvg5 : 0;

  const domainAvgs = Array.from(domainStats.entries()).map(([name, st]) => ({
    name,
    avg: Math.round((st.studentSum / st.count) * 10) / 10,
    cohortAvg: Math.round((st.cohortSum / st.count) * 10) / 10
  }));

  // Si un seul domaine est présent, affiner par sous-domaine pour un bilan plus précis
  let granularAvgs = domainAvgs;
  if (domainAvgs.length < 2 && studentComps.length > 0) {
    const subStats = new Map<string, { studentSum: number; cohortSum: number; count: number }>();
    studentComps.forEach(c => {
      const sub = c.subDomain || getDomain(c);
      if (!sub) return;
      const score = Number(results[student.id]?.[c.id]?.score ?? 0);
      const cohortAvg = evaluatedMap.get(c.id)?.cohortAvg ?? 0;
      const cur = subStats.get(sub) || { studentSum: 0, cohortSum: 0, count: 0 };
      cur.studentSum += score;
      cur.cohortSum += cohortAvg;
      cur.count += 1;
      subStats.set(sub, cur);
    });
    if (subStats.size >= 2) {
      granularAvgs = Array.from(subStats.entries()).map(([name, st]) => ({
        name,
        avg: Math.round((st.studentSum / st.count) * 10) / 10,
        cohortAvg: Math.round((st.cohortSum / st.count) * 10) / 10
      }));
    }
  }

  // En pédagogie spiralaire (objectif = 5) :
  // - Point fort : proche/au-dessus de 5 (>= 4.2) OU nettement au-dessus de la classe (+0.8)
  // - À consolider : nettement sous le seuil (< 3.0) ET en retrait par rapport à la classe (< cohortAvg - 0.5)
  const strongDomains = [...granularAvgs]
    .filter(d => d.avg >= 4.2 || (d.avg >= 2.5 && d.avg - d.cohortAvg >= 0.8))
    .sort((a, b) => b.avg - a.avg)
    .slice(0, 2);

  const weakDomains = [...granularAvgs]
    .filter(d => d.avg < 3.0 && d.avg < d.cohortAvg - 0.5)
    .sort((a, b) => a.avg - b.avg)
    .slice(0, 2);

  // Fluence
  const studentFluence = fluenceScores
    .filter(s => {
      const sid = s.studentId || (s as any).studentid;
      const raw = s.score;
      return (
        sid === student.id &&
        raw !== null &&
        raw !== undefined &&
        String(raw) !== '' &&
        !isNaN(Number(raw))
      );
    })
    .map(s => ({
      period: Number(s.period),
      score: Number(s.score)
    }))
    .sort((a, b) => a.period - b.period);

  let fluenceLatest: { period: number; score: number; target: number | null } | null = null;
  let fluenceDelta: number | null = null;

  if (studentFluence.length > 0) {
    const last = studentFluence[studentFluence.length - 1];
    const ref = fluenceReferences.find(
      r => r.grade === student.grade && Number(r.period) === last.period
    );
    fluenceLatest = {
      period: last.period,
      score: last.score,
      target: ref ? Number(ref.target_score) : null
    };
    if (studentFluence.length >= 2) {
      fluenceDelta = last.score - studentFluence[0].score;
    }
  }

  // Curriculum
  const gradeCurrItems = curriculumItems.filter(i => i.grade === student.grade);
  const currItemsToUse = gradeCurrItems.length > 0 ? gradeCurrItems : curriculumItems;
  let curriculumPct: number | null = null;
  if (currItemsToUse.length > 0) {
    const scoreMap = new Map<number, number>();
    curriculumResults.forEach(r => {
      if (r.studentId === student.id) scoreMap.set(r.curriculumId, r.score);
    });
    const totalCurr = currItemsToUse.reduce((acc, item) => acc + (scoreMap.get(item.id) ?? 0), 0);
    const maxCurr = currItemsToUse.length * 3;
    if (totalCurr > 0 && maxCurr > 0) {
      curriculumPct = Math.round((totalCurr / maxCurr) * 100);
    }
  }

  // Construction des phrases sur la base du seuil de 5 réussites + rythme spiralaire
  const v = ((options.variant ?? 0) % 3 + 3) % 3;
  const firstName = student.firstName.trim();
  const sentences: string[] = [];

  if (rawAvg5 !== null && targetPct !== null) {
    const statSuffix = options.includeNumbers
      ? ` (${targetPct} % d'atteinte sur l'objectif de 5 réussites, moyenne ${rawAvg5}/5 vs ${cohortAvg5}/5 pour la classe)`
      : '';

    const isExcellent =
      targetPct >= 82 ||
      rawAvg5 >= 4.5 ||
      (relativeDelta >= 1.0 && rawAvg5 >= 3.2);

    const isGood =
      !isExcellent &&
      (targetPct >= 58 || rawAvg5 >= 3.0 || relativeDelta >= -0.2);

    const isDeveloping =
      !isExcellent &&
      !isGood &&
      (rawAvg5 >= 1.8 || relativeDelta >= -1.0);

    if (options.style === 'lsu') {
      if (isExcellent) {
        const openers = [
          `Excellente période pour ${firstName}, qui valide solidement les réussites attendues et progresse avec beaucoup d'aisance${statSuffix}.`,
          `Très beau bilan pour ${firstName} : les apprentissages en cours sont maîtrisés avec régularité${statSuffix}.`,
          `${firstName} réalise un parcours très solide sur les notions travaillées, avec des réussites déjà bien affirmées${statSuffix}.`
        ];
        sentences.push(openers[v]);
      } else if (isGood) {
        const openers = [
          `Période encourageante pour ${firstName}, qui construit ses réussites au rythme attendu de la progression spiralaire${statSuffix}.`,
          `Bilan satisfaisant pour ${firstName} : les apprentissages avancent régulièrement vers les objectifs de l'année${statSuffix}.`,
          `${firstName} s'approprie progressivement les notions travaillées et enregistre des réussites régulières${statSuffix}.`
        ];
        sentences.push(openers[v]);
      } else if (isDeveloping) {
        const openers = [
          `Des réussites apparaissent chez ${firstName}, mais l'automatisation des notions reste encore en cours de construction${statSuffix}.`,
          `Bilan en progrès pour ${firstName} : plusieurs compétences demandent encore de l'entraînement régulier pour atteindre le seuil visé${statSuffix}.`,
          `${firstName} progresse à son rythme ; la reprise spiralaire des notions permettra de consolider les acquis encore fragiles${statSuffix}.`
        ];
        sentences.push(openers[v]);
      } else {
        const openers = [
          `Période plus délicate pour ${firstName}, qui a besoin d'un étayage renforcé pour accumuler ses premières réussites${statSuffix}.`,
          `${firstName} rencontre encore des difficultés sur les notions abordées ; un accompagnement ciblé est mis en place en classe${statSuffix}.`,
          `Les réussites ${dePrenom(firstName)} restent encore fragiles à ce stade ; un suivi régulier en petit groupe l'aide à prendre confiance${statSuffix}.`
        ];
        sentences.push(openers[v]);
      }
    } else {
      // Style RDV Parents
      if (isExcellent) {
        const openers = [
          `${firstName} traverse une excellente période et accumule les réussites avec beaucoup d'aisance sur les notions travaillées${statSuffix}.`,
          `Nous pouvons féliciter ${firstName} pour son très bon rythme d'apprentissage : les acquis se construisent très solidement${statSuffix}.`,
          `${firstName} obtient des résultats très satisfaisants et se montre très à l'aise dans la progression de la classe${statSuffix}.`
        ];
        sentences.push(openers[v]);
      } else if (isGood) {
        const openers = [
          `${firstName} avance de manière positive et construit régulièrement ses réussites au fil des séances${statSuffix}.`,
          `C'est une période encourageante pour ${firstName}, qui suit bien le rythme des apprentissages de la classe${statSuffix}.`,
          `${firstName} consolide progressivement ses repères et valide de nouvelles réussites à chaque reprise des notions${statSuffix}.`
        ];
        sentences.push(openers[v]);
      } else if (isDeveloping) {
        const openers = [
          `${firstName} fournit des efforts, et les reprises régulières des notions vont l'aider à atteindre progressivement le seuil de validation${statSuffix}.`,
          `Sur cette période, ${firstName} construit ses acquis pas à pas ; certaines notions nécessitent encore un peu de pratique${statSuffix}.`,
          `${firstName} est en cours d'apprentissage et bénéficie d'un accompagnement ciblé pour stabiliser ses réussites${statSuffix}.`
        ];
        sentences.push(openers[v]);
      } else {
        const openers = [
          `${firstName} a besoin d'être rassuré(e) et accompagné(e) de près pour consolider les bases en cours d'acquisition${statSuffix}.`,
          `Certaines notions résistent encore pour ${firstName} ; nous adaptons les temps d'entraînement en petit groupe pour l'aider à progresser${statSuffix}.`,
          `Un soutien régulier est mis en place en classe pour aider ${firstName} à gagner en réussite et en confiance${statSuffix}.`
        ];
        sentences.push(openers[v]);
      }
    }
  } else {
    sentences.push(
      `Les évaluations sur les chapitres de ${student.grade} sont encore en cours d'ouverture ou de saisie pour ${firstName}.`
    );
  }

  // Points forts
  if (strongDomains.length > 0) {
    const formatted = strongDomains.map(d =>
      options.includeNumbers ? `${d.name} (${d.avg}/5)` : d.name
    );
    const listStr = joinFrenchList(formatted);
    if (options.style === 'lsu') {
      const phrases = [
        `Les réussites en ${listStr} sont particulièrement notables.`,
        `${firstName} se distingue notamment par de beaux acquis en ${listStr}.`,
        `Une belle aisance est constatée en ${listStr}.`
      ];
      sentences.push(phrases[v]);
    } else {
      const phrases = [
        `Ses principaux points d'appui se situent en ${listStr}, où il/elle progresse avec confiance.`,
        `On observe une belle maîtrise en ${listStr}, ce qui est très positif pour la suite.`,
        `Les réussites sont particulièrement solides en ${listStr}.`
      ];
      sentences.push(phrases[v]);
    }
  }

  // Axes à consolider
  if (weakDomains.length > 0) {
    const formatted = weakDomains.map(d =>
      options.includeNumbers ? `${d.name} (${d.avg}/5)` : d.name
    );
    const listStr = joinFrenchList(formatted);
    if (options.style === 'lsu') {
      const phrases = [
        `Une vigilance reste nécessaire en ${listStr}, qui sera consolidée en atelier dirigé.`,
        `Un entraînement régulier demeure utile pour renforcer les notions en ${listStr}.`,
        `Les apprentissages en ${listStr} demandent encore à être stabilisés.`
      ];
      sentences.push(phrases[v]);
    } else {
      const phrases = [
        `À la maison comme en classe, il sera bénéfique de reprendre régulièrement les notions de ${listStr}.`,
        `L'axe prioritaire pour les prochaines semaines concerne ${listStr}, retravaillé en petit groupe.`,
        `De courts rappels réguliers en ${listStr} l'aideront à ancrer ses réussites.`
      ];
      sentences.push(phrases[v]);
    }
  }

  // Fluence
  if (fluenceLatest) {
    const mclmStr = options.includeNumbers ? ` (${fluenceLatest.score} mots/min en P${fluenceLatest.period})` : '';
    const targetMet = fluenceLatest.target !== null && fluenceLatest.score >= fluenceLatest.target;
    const nearTarget =
      fluenceLatest.target !== null &&
      fluenceLatest.score < fluenceLatest.target &&
      fluenceLatest.score >= fluenceLatest.target * 0.8;

    const deltaStr =
      fluenceDelta !== null && fluenceDelta >= 5
        ? options.includeNumbers
          ? ` (+${fluenceDelta} mots/min depuis la P${studentFluence[0].period})`
          : ' (progression nette depuis le début de suivi)'
        : '';

    if (targetMet) {
      sentences.push(
        options.style === 'lsu'
          ? `En lecture orale, la fluence atteint l'objectif attendu${mclmStr}${deltaStr}.`
          : `En lecture à voix haute, la vitesse de lecture est fluide et répond aux attentes du niveau${mclmStr}${deltaStr}.`
      );
    } else if (nearTarget) {
      sentences.push(
        options.style === 'lsu'
          ? `En lecture orale, la fluence progresse et se rapproche du seuil attendu${mclmStr}${deltaStr}.`
          : `La lecture gagne en fluidité${deltaStr} et se rapproche de l'objectif visé${mclmStr} ; la lecture quotidienne à voix haute reste bénéfique.`
      );
    } else if (fluenceLatest.target !== null) {
      sentences.push(
        options.style === 'lsu'
          ? `En lecture orale, la fluence demeure à renforcer pour gagner en aisance${mclmStr}${deltaStr}.`
          : `La fluidité de lecture demande encore de l'entraînement${mclmStr}${deltaStr} ; de courts temps de lecture à voix haute réguliers sont encouragés.`
      );
    } else {
      sentences.push(`En lecture orale, le score de fluence enregistré est de ${fluenceLatest.score} mots/min.`);
    }
  }

  // Curriculum si demandé
  if (curriculumPct !== null && options.includeNumbers && options.style === 'parents') {
    sentences.push(`Sur le parcours de compétences annuel (curriculum), le taux de validation atteint ${curriculumPct} %.`);
  }

  // Conclusion si aucun point faible signalé
  if (weakDomains.length === 0 && rawAvg5 !== null && (targetPct ?? 0) >= 60) {
    sentences.push(
      options.style === 'lsu'
        ? `Il convient de poursuivre sur cette belle dynamique.`
        : `Félicitations pour cette implication régulière, à poursuivre sur la prochaine période.`
    );
  }

  return {
    student,
    evaluatedCount: totalCount,
    rawAvg5,
    cohortAvg5,
    targetPct,
    strongDomains,
    weakDomains,
    fluenceLatest,
    fluenceDelta,
    curriculumPct,
    text: sentences.join(' ')
  };
}
