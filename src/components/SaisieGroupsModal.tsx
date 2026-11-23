import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Users,
  CheckSquare,
  Square,
  Shuffle,
  Monitor,
  Eye,
  EyeOff,
  ArrowLeftRight,
  AlertTriangle,
  CheckCircle2,
  Copy,
  Check,
  SlidersHorizontal,
  Sparkles,
  Info
} from 'lucide-react';
import { Student, Competence, Result } from '../types';
import { getCode, getGrade, getDomain, createDomainSorter } from '../utils/helpers';

interface SaisieGroupsModalProps {
  isOpen: boolean;
  onClose: () => void;
  students: Student[];
  competences: Competence[];
  results: Record<string, Record<number, Result>>;
  initialGrade?: string;
  initialDomain?: string;
  initialSubDomain?: string;
}

type GroupSize = 2 | 4;
type PairingMode = 'homogeneous' | 'heterogeneous';
type RemainderHandling = 'adjust' | 'reduced';

interface CompetenceEvalInfo {
  comp: Competence;
  grade: string;
  classAvg: number;
  nonZeroRatio: number;
  isEvaluated: boolean;
}

interface ResolvedSaisieStudent {
  student: Student;
  score: number | null; // moyenne sur /10
  evaluatedCount: number;
  fallbackSource: 'none' | 'subdomain' | 'domain';
}

interface StudentGroup {
  id: string;
  members: ResolvedSaisieStudent[];
}

export default function SaisieGroupsModal({
  isOpen,
  onClose,
  students,
  competences,
  results,
  initialGrade = 'all',
  initialDomain = 'all',
  initialSubDomain = 'all'
}: SaisieGroupsModalProps) {
  const [selectedGrade, setSelectedGrade] = useState<string>(initialGrade);
  const [selectedDomain, setSelectedDomain] = useState<string>(initialDomain);
  const [selectedSubDomain, setSelectedSubDomain] = useState<string>(initialSubDomain);
  const [selectedCode, setSelectedCode] = useState<string>('all');
  const [requireQuarterNonZero, setRequireQuarterNonZero] = useState<boolean>(false);

  const [groupSize, setGroupSize] = useState<GroupSize>(2);
  const [mode, setMode] = useState<PairingMode>('heterogeneous');
  const [remainderHandling, setRemainderHandling] = useState<RemainderHandling>('adjust');

  const [presentIds, setPresentIds] = useState<Set<string>>(new Set());
  const [groups, setGroups] = useState<StudentGroup[]>([]);
  const [hasGenerated, setHasGenerated] = useState<boolean>(false);
  const [swapSelection, setSwapSelection] = useState<{ groupIdx: number; memberIdx: number } | null>(null);

  const [isTniMode, setIsTniMode] = useState<boolean>(false);
  const [showScoresInTni, setShowScoresInTni] = useState<boolean>(false);
  const [showScoresInPrep, setShowScoresInPrep] = useState<boolean>(true);
  const [copied, setCopied] = useState<boolean>(false);

  const activeStudents = useMemo(
    () =>
      students
        .filter(s => !s.isArchived && (selectedGrade === 'all' || s.grade === selectedGrade))
        .sort((a, b) => a.lastName.localeCompare(b.lastName, 'fr') || a.firstName.localeCompare(b.firstName, 'fr')),
    [students, selectedGrade]
  );

  // Initialiser les filtres à l'ouverture depuis SaisieTab
  useEffect(() => {
    if (isOpen) {
      setSelectedGrade(initialGrade);
      setSelectedDomain(initialDomain);
      setSelectedSubDomain(initialSubDomain);
      setSelectedCode('all');
      setGroups([]);
      setHasGenerated(false);
      setSwapSelection(null);
      setIsTniMode(false);
      setShowScoresInTni(false);
    }
  }, [isOpen, initialGrade, initialDomain, initialSubDomain]);

  // Synchroniser les présents quand le filtre niveau change ou à l'ouverture
  useEffect(() => {
    if (isOpen) {
      setPresentIds(new Set(activeStudents.map(s => s.id)));
      setGroups([]);
      setHasGenerated(false);
      setSwapSelection(null);
    }
  }, [isOpen, selectedGrade, activeStudents.length]);

  const sortDomains = useMemo(() => createDomainSorter(competences), [competences]);

  const uniqueGrades = useMemo(
    () => Array.from(new Set(students.filter(s => !s.isArchived).map(s => s.grade))).sort(),
    [students]
  );

  const uniqueDomains = useMemo(
    () => Array.from(new Set(competences.map(c => getDomain(c)).filter(Boolean))).sort(sortDomains),
    [competences, sortDomains]
  );

  const uniqueSubDomains = useMemo(
    () =>
      Array.from(
        new Set(
          competences
            .filter(c => selectedDomain === 'all' || getDomain(c) === selectedDomain)
            .map(c => c.subDomain)
            .filter((sd): sd is string => Boolean(sd))
        )
      ).sort((a, b) => a.localeCompare(b, 'fr', { numeric: true })),
    [competences, selectedDomain]
  );

  // Liste des chapitres (code + titre) filtrés à partir des données présentes en DB
  const availableChapters = useMemo(() => {
    const filtered = competences.filter(c => {
      if (selectedGrade !== 'all' && getGrade(c) !== selectedGrade) return false;
      if (selectedDomain !== 'all' && getDomain(c) !== selectedDomain && c.subDomain !== selectedDomain) return false;
      if (selectedSubDomain !== 'all' && c.subDomain !== selectedSubDomain) return false;
      return Boolean(getCode(c));
    });

    const map = new Map<string, { code: string; label: string }>();
    filtered.forEach(c => {
      const code = getCode(c);
      if (!code) return;
      let cleanTitle = c.title || '';
      if (cleanTitle.includes(' : ')) {
        cleanTitle = cleanTitle.split(' : ').slice(1).join(' : ');
      }
      if (!map.has(code)) {
        map.set(code, {
          code,
          label: cleanTitle ? `${code} — ${cleanTitle}` : code
        });
      }
    });

    return Array.from(map.values()).sort((a, b) => a.code.localeCompare(b.code, 'fr', { numeric: true }));
  }, [competences, selectedGrade, selectedDomain, selectedSubDomain]);

  // Réinitialiser selectedCode si le chapitre choisi n'existe plus dans les filtres
  useEffect(() => {
    if (selectedCode !== 'all' && !availableChapters.some(ch => ch.code === selectedCode)) {
      setSelectedCode('all');
    }
  }, [availableChapters, selectedCode]);

  // Calcul du statut d'évaluation de chaque compétence par niveau :
  // Si la moyenne de la classe (sur ce niveau) > 0, alors la compétence est considérée évaluée (les 0/10 comptent comme vrais 0/10).
  const competenceEvalMap = useMemo(() => {
    const evalMap = new Map<number, CompetenceEvalInfo>();
    const activeByGrade = new Map<string, Student[]>();

    students
      .filter(s => !s.isArchived)
      .forEach(s => {
        const list = activeByGrade.get(s.grade) || [];
        list.push(s);
        activeByGrade.set(s.grade, list);
      });

    competences.forEach(comp => {
      const grade = getGrade(comp);
      const gradeStudents = activeByGrade.get(grade) || [];

      if (gradeStudents.length === 0) {
        evalMap.set(comp.id, { comp, grade, classAvg: 0, nonZeroRatio: 0, isEvaluated: false });
        return;
      }

      let anyStarted = false;
      let sum = 0;
      let nonZeroCount = 0;

      gradeStudents.forEach(st => {
        const res = results[st.id]?.[comp.id];
        if (res?.isStarted) anyStarted = true;
        const sc = res?.score ?? 0;
        sum += sc;
        if (sc > 0) nonZeroCount++;
      });

      const classAvg = sum / gradeStudents.length;
      const nonZeroRatio = nonZeroCount / gradeStudents.length;

      const isEvaluated =
        anyStarted &&
        classAvg > 0 &&
        (!requireQuarterNonZero || nonZeroRatio >= 0.25);

      evalMap.set(comp.id, {
        comp,
        grade,
        classAvg,
        nonZeroRatio,
        isEvaluated
      });
    });

    return evalMap;
  }, [competences, students, results, requireQuarterNonZero]);

  // Résumé du statut d'évaluation pour les filtres actuels
  const filterEvalSummary = useMemo(() => {
    const matching = competences.filter(c => {
      if (selectedGrade !== 'all' && getGrade(c) !== selectedGrade) return false;
      if (selectedDomain !== 'all' && getDomain(c) !== selectedDomain && c.subDomain !== selectedDomain) return false;
      if (selectedSubDomain !== 'all' && c.subDomain !== selectedSubDomain) return false;
      if (selectedCode !== 'all' && getCode(c) !== selectedCode) return false;
      return true;
    });

    const evalInfos = matching
      .map(c => competenceEvalMap.get(c.id))
      .filter((info): info is CompetenceEvalInfo => Boolean(info));

    const evaluatedInfos = evalInfos.filter(i => i.isEvaluated);

    return {
      totalCount: evalInfos.length,
      evaluatedCount: evaluatedInfos.length,
      evalInfos
    };
  }, [competences, competenceEvalMap, selectedGrade, selectedDomain, selectedSubDomain, selectedCode]);

  // Calcul du score (/10) résolu pour chaque élève actif
  const resolvedStudentsMap = useMemo(() => {
    const map = new Map<string, ResolvedSaisieStudent>();

    const computeAvg = (studentId: string, comps: Competence[]) => {
      const evaluated = comps.filter(c => competenceEvalMap.get(c.id)?.isEvaluated);
      if (evaluated.length === 0) return null;
      const sum = evaluated.reduce((acc, c) => acc + (results[studentId]?.[c.id]?.score ?? 0), 0);
      return {
        avg: Math.round((sum / evaluated.length) * 10) / 10,
        count: evaluated.length
      };
    };

    activeStudents.forEach(student => {
      // 1. Cible exacte (grade + domain + subDomain + code)
      const primaryComps = competences.filter(c => {
        if (getGrade(c) !== student.grade) return false;
        if (selectedDomain !== 'all' && getDomain(c) !== selectedDomain && c.subDomain !== selectedDomain) return false;
        if (selectedSubDomain !== 'all' && c.subDomain !== selectedSubDomain) return false;
        if (selectedCode !== 'all' && getCode(c) !== selectedCode) return false;
        return true;
      });

      const primaryRes = computeAvg(student.id, primaryComps);
      if (primaryRes) {
        map.set(student.id, {
          student,
          score: primaryRes.avg,
          evaluatedCount: primaryRes.count,
          fallbackSource: 'none'
        });
        return;
      }

      // 2. Repli sur le sous-domaine si un chapitre spécifique n'avait pas encore de moyenne > 0
      if (selectedCode !== 'all' && selectedSubDomain !== 'all') {
        const subComps = competences.filter(c => {
          if (getGrade(c) !== student.grade) return false;
          if (selectedDomain !== 'all' && getDomain(c) !== selectedDomain && c.subDomain !== selectedDomain) return false;
          return c.subDomain === selectedSubDomain;
        });
        const subRes = computeAvg(student.id, subComps);
        if (subRes) {
          map.set(student.id, {
            student,
            score: subRes.avg,
            evaluatedCount: subRes.count,
            fallbackSource: 'subdomain'
          });
          return;
        }
      }

      // 3. Repli sur le domaine si toujours rien
      if ((selectedCode !== 'all' || selectedSubDomain !== 'all') && selectedDomain !== 'all') {
        const domComps = competences.filter(
          c => getGrade(c) === student.grade && (getDomain(c) === selectedDomain || c.subDomain === selectedDomain)
        );
        const domRes = computeAvg(student.id, domComps);
        if (domRes) {
          map.set(student.id, {
            student,
            score: domRes.avg,
            evaluatedCount: domRes.count,
            fallbackSource: 'domain'
          });
          return;
        }
      }

      map.set(student.id, {
        student,
        score: null,
        evaluatedCount: 0,
        fallbackSource: 'none'
      });
    });

    return map;
  }, [
    activeStudents,
    competences,
    competenceEvalMap,
    results,
    selectedDomain,
    selectedSubDomain,
    selectedCode
  ]);

  // Seuil d'écart recommandé sur /10 selon taille et mode
  const recommendedMaxGap = useMemo(() => {
    if (mode === 'homogeneous') return 2.0;
    return groupSize === 2 ? 4.0 : 5.0;
  }, [mode, groupSize]);

  const [customMaxGap, setCustomMaxGap] = useState<number>(recommendedMaxGap);

  useEffect(() => {
    setCustomMaxGap(recommendedMaxGap);
  }, [recommendedMaxGap]);

  // Écart inter-équipes (utile surtout pour les équipes de 4 hétérogènes)
  const interTeamAvgSpread = useMemo(() => {
    if (groups.length < 2) return null;
    const avgs = groups
      .map(g => {
        const scores = g.members.map(m => m.score).filter((s): s is number => s !== null);
        if (scores.length === 0) return null;
        return scores.reduce((a, b) => a + b, 0) / scores.length;
      })
      .filter((v): v is number => v !== null);
    if (avgs.length < 2) return null;
    return Math.round((Math.max(...avgs) - Math.min(...avgs)) * 10) / 10;
  }, [groups]);

  if (!isOpen) return null;

  const toggleStudentPresence = (id: string) => {
    setPresentIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllClass = () => setPresentIds(new Set(activeStudents.map(s => s.id)));
  const deselectAllClass = () => setPresentIds(new Set());

  const generateGroups = () => {
    const presentList = activeStudents
      .filter(s => presentIds.has(s.id))
      .map(s => resolvedStudentsMap.get(s.id)!)
      .filter(Boolean);

    if (presentList.length === 0) {
      setGroups([]);
      setHasGenerated(true);
      return;
    }

    const scored = presentList
      .filter(item => item.score !== null)
      .sort((a, b) => (b.score as number) - (a.score as number));
    const unscored = presentList.filter(item => item.score === null);
    const pool = [...scored, ...unscored];
    const n = pool.length;

    const nextGroups: StudentGroup[] = [];

    if (groupSize === 2) {
      if (n === 1) {
        nextGroups.push({ id: 'grp-1', members: [pool[0]] });
      } else if (mode === 'homogeneous') {
        for (let i = 0; i < n; i += 2) {
          if (i + 1 < n) {
            nextGroups.push({ id: `grp-${nextGroups.length + 1}`, members: [pool[i], pool[i + 1]] });
          } else if (remainderHandling === 'adjust' && nextGroups.length > 0) {
            nextGroups[nextGroups.length - 1].members.push(pool[i]);
          } else {
            nextGroups.push({ id: `grp-${nextGroups.length + 1}`, members: [pool[i]] });
          }
        }
      } else {
        // Hétérogène en binômes : demi-glissement
        const half = Math.floor(n / 2);
        for (let i = 0; i < half; i++) {
          nextGroups.push({
            id: `grp-${i + 1}`,
            members: [pool[i], pool[half + i]]
          });
        }
        if (n % 2 === 1) {
          const leftover = pool[n - 1];
          if (remainderHandling === 'adjust' && nextGroups.length > 0) {
            const targetIdx = Math.floor(nextGroups.length / 2);
            nextGroups[targetIdx].members.push(leftover);
          } else {
            nextGroups.push({ id: `grp-${nextGroups.length + 1}`, members: [leftover] });
          }
        }
      }
    } else {
      // Équipes de 4
      if (n <= 4) {
        nextGroups.push({ id: 'grp-1', members: pool });
      } else if (mode === 'homogeneous') {
        const fullTeams = Math.floor(n / 4);
        const rem = n % 4;
        let idx = 0;
        for (let t = 0; t < fullTeams; t++) {
          nextGroups.push({ id: `grp-${t + 1}`, members: pool.slice(idx, idx + 4) });
          idx += 4;
        }
        if (rem > 0) {
          if (remainderHandling === 'adjust') {
            if (rem === 3) {
              // 3 est déjà un trio solide
              nextGroups.push({ id: `grp-${nextGroups.length + 1}`, members: pool.slice(idx) });
            } else {
              // Répartir 1 ou 2 élèves restants dans les dernières équipes (groupes de 5)
              const leftovers = pool.slice(idx);
              leftovers.forEach((studentItem, lIdx) => {
                const target = nextGroups[nextGroups.length - 1 - (lIdx % nextGroups.length)];
                target.members.push(studentItem);
              });
            }
          } else {
            nextGroups.push({ id: `grp-${nextGroups.length + 1}`, members: pool.slice(idx) });
          }
        }
      } else {
        // Hétérogène en équipes de 4 : distribution serpentin
        let numTeams =
          remainderHandling === 'reduced' ? Math.ceil(n / 4) : Math.max(1, Math.floor(n / 4));
        if (remainderHandling === 'adjust' && n % 4 === 3) {
          numTeams = Math.ceil(n / 4); // ex. 19 élèves -> 5 équipes (4,4,4,4,3)
        }

        for (let t = 0; t < numTeams; t++) {
          nextGroups.push({ id: `grp-${t + 1}`, members: [] });
        }

        pool.forEach((studentItem, idx) => {
          const cycle = Math.floor(idx / numTeams);
          const posInCycle = idx % numTeams;
          const teamIdx = cycle % 2 === 0 ? posInCycle : numTeams - 1 - posInCycle;
          nextGroups[teamIdx].members.push(studentItem);
        });
      }
    }

    setGroups(nextGroups);
    setHasGenerated(true);
    setSwapSelection(null);
  };

  const handleMemberClickForSwap = (groupIdx: number, memberIdx: number) => {
    if (!swapSelection) {
      setSwapSelection({ groupIdx, memberIdx });
      return;
    }
    if (swapSelection.groupIdx === groupIdx && swapSelection.memberIdx === memberIdx) {
      setSwapSelection(null);
      return;
    }

    setGroups(prev => {
      const next = prev.map(g => ({ ...g, members: [...g.members] }));
      const first = next[swapSelection.groupIdx].members[swapSelection.memberIdx];
      const second = next[groupIdx].members[memberIdx];
      next[swapSelection.groupIdx].members[swapSelection.memberIdx] = second;
      next[groupIdx].members[memberIdx] = first;
      return next;
    });
    setSwapSelection(null);
  };

  const getGroupMetrics = (group: StudentGroup) => {
    const validScores = group.members.map(m => m.score).filter((s): s is number => s !== null);
    if (validScores.length < 2) {
      return {
        gap: null,
        avg: validScores.length === 1 ? validScores[0] : null,
        status: 'neutral' as const,
        label: group.members.length === 1 ? 'Solo / Enseignant' : 'Score manquant'
      };
    }

    const maxScore = Math.max(...validScores);
    const minScore = Math.min(...validScores);
    const gap = Math.round((maxScore - minScore) * 10) / 10;
    const avg = Math.round((validScores.reduce((a, b) => a + b, 0) / validScores.length) * 10) / 10;

    if (mode === 'homogeneous') {
      if (gap <= customMaxGap) {
        return { gap, avg, status: 'optimal' as const, label: 'Écart homogène' };
      }
      return { gap, avg, status: 'warning' as const, label: 'Écart élevé' };
    } else {
      if (gap > customMaxGap) {
        return { gap, avg, status: 'warning' as const, label: 'Écart important' };
      }
      if (groupSize === 2 && gap < 1.0) {
        return { gap, avg, status: 'info' as const, label: 'Niveaux proches' };
      }
      return { gap, avg, status: 'optimal' as const, label: groupSize === 4 ? 'Équipe équilibrée' : 'Tutorat équilibré' };
    }
  };

  const getGroupTitle = (group: StudentGroup, idx: number) => {
    if (group.members.length === 1) return `Solo ${idx + 1}`;
    if (group.members.length === 2) return `Binôme ${idx + 1}`;
    if (group.members.length === 3) return groupSize === 2 ? `Trinôme ${idx + 1}` : `Équipe ${idx + 1}`;
    return `Équipe ${idx + 1}`;
  };

  const handleCopyText = () => {
    const lines = groups.map((g, idx) => {
      const names = g.members.map(m => `${m.student.firstName} ${m.student.lastName}`).join(' + ');
      return `${getGroupTitle(g, idx)} : ${names}`;
    });
    navigator.clipboard?.writeText(lines.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getScoreBadgeClass = (score: number | null) => {
    if (score === null) return 'bg-slate-100 text-slate-400 border-slate-200';
    if (score >= 5) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    if (score >= 3) return 'bg-amber-50 text-amber-700 border-amber-200';
    return 'bg-rose-50 text-rose-700 border-rose-200';
  };

  const presentCount = activeStudents.filter(s => presentIds.has(s.id)).length;
  const fallbackCount = activeStudents.filter(
    s => presentIds.has(s.id) && resolvedStudentsMap.get(s.id)?.fallbackSource !== 'none'
  ).length;

  // --- MODE PROJECTION TNI ---
  if (isTniMode) {
    return (
      <div className="fixed inset-0 bg-slate-900 z-50 flex flex-col overflow-hidden">
        <div className="bg-slate-800 border-b border-slate-700 px-6 py-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow">
              <Monitor className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">
                {groupSize === 2 ? 'Binômes' : 'Équipes'} — {mode === 'homogeneous' ? 'Groupes de besoin' : 'Coopération & Tutorat'}
              </h2>
              <p className="text-xs text-slate-300">
                {selectedGrade === 'all' ? 'Toute la classe' : selectedGrade}
                {selectedDomain !== 'all' ? ` • ${selectedDomain}` : ''}
                {selectedSubDomain !== 'all' ? ` • ${selectedSubDomain}` : ''}
                {selectedCode !== 'all' ? ` • ${selectedCode}` : ''}
                {` • ${presentCount} présents`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowScoresInTni(prev => !prev)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border transition ${
                showScoresInTni
                  ? 'bg-indigo-600 text-white border-indigo-500'
                  : 'bg-slate-700 text-slate-200 border-slate-600 hover:bg-slate-600'
              }`}
            >
              {showScoresInTni ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              {showScoresInTni ? 'Masquer les scores' : 'Afficher les scores'}
            </button>

            <button
              onClick={() => setIsTniMode(false)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-white text-slate-800 hover:bg-slate-100 transition"
            >
              <X className="w-4 h-4" />
              Quitter le mode TNI
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 sm:p-8">
          <div className="max-w-7xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {groups.map((group, idx) => (
              <div
                key={group.id}
                className="bg-white rounded-2xl shadow-lg border-2 border-indigo-100 p-5 flex flex-col"
              >
                <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100">
                  <span className="text-xs font-bold uppercase tracking-wider text-indigo-700 bg-indigo-50 px-3 py-1 rounded-md">
                    {getGroupTitle(group, idx)}
                  </span>
                  <span className="text-[11px] font-semibold text-slate-500">
                    {group.members.length} élève{group.members.length > 1 ? 's' : ''}
                  </span>
                </div>

                <div className="space-y-2.5">
                  {group.members.map(member => (
                    <div
                      key={member.student.id}
                      className="flex items-center justify-between gap-2 bg-slate-50 rounded-xl px-4 py-2.5 border border-slate-200"
                    >
                      <div>
                        <div className="text-lg font-extrabold text-slate-900 leading-tight">
                          {member.student.firstName}
                        </div>
                        <div className="text-xs font-semibold text-slate-500">
                          {member.student.lastName}
                          {selectedGrade === 'all' ? ` • ${member.student.grade}` : ''}
                        </div>
                      </div>

                      {showScoresInTni && (
                        <div className="text-right shrink-0">
                          <span
                            className={`inline-block text-sm font-bold px-2.5 py-1 rounded-lg border ${getScoreBadgeClass(
                              member.score
                            )}`}
                          >
                            {member.score !== null ? `${member.score}/10` : '—'}
                          </span>
                          {member.fallbackSource !== 'none' && (
                            <div className="text-[10px] font-semibold text-slate-400 mt-0.5">
                              ({member.fallbackSource === 'subdomain' ? 'Sous-dom.' : 'Domaine'})
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // --- MODALE DE PRÉPARATION ---
  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[92vh] border border-slate-200 flex flex-col overflow-hidden">
        {/* En-tête */}
        <div className="px-6 py-4 bg-indigo-700 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-indigo-600 flex items-center justify-center border border-indigo-500">
              <Users className="w-5 h-5 text-indigo-100" />
            </div>
            <div>
              <h3 className="font-bold text-base">Générateur de Binômes (2) & Équipes (4) — Réussites</h3>
              <p className="text-xs text-indigo-200">
                Filtre automatiquement les chapitres selon la moyenne de classe : si moyenne &gt; 0, les 0/10 comptent comme acquis à 0 ; si moyenne = 0, le chapitre est considéré non évalué.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-indigo-200 hover:text-white transition p-1.5 rounded-lg hover:bg-indigo-600/50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Corps 2 colonnes */}
        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 bg-slate-50/60">
          {/* Colonne Gauche : Filtres DB + Paramètres + Présents */}
          <div className="lg:col-span-5 flex flex-col gap-4">
            {/* 1. Filtres sur la DB */}
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                1. Critères de réussite (Base de données)
              </h4>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Niveau</label>
                  <select
                    value={selectedGrade}
                    onChange={e => setSelectedGrade(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="all">Tous les niveaux</option>
                    {uniqueGrades.map(g => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Domaine</label>
                  <select
                    value={selectedDomain}
                    onChange={e => {
                      setSelectedDomain(e.target.value);
                      setSelectedSubDomain('all');
                      setSelectedCode('all');
                    }}
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="all">Tous</option>
                    {uniqueDomains.map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Sous-domaine</label>
                <select
                  value={selectedSubDomain}
                  onChange={e => {
                    setSelectedSubDomain(e.target.value);
                    setSelectedCode('all');
                  }}
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="all">Tous les sous-domaines</option>
                  {uniqueSubDomains.map(sd => (
                    <option key={sd} value={sd}>{sd}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Chapitre / Compétence</label>
                <select
                  value={selectedCode}
                  onChange={e => setSelectedCode(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="all">Moyenne des chapitres évalués du filtre</option>
                  {availableChapters.map(ch => (
                    <option key={ch.code} value={ch.code}>
                      {ch.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Statut d'évaluation détecté via la moyenne de classe */}
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-[11px] space-y-1.5">
                <div className="flex items-start gap-1.5 text-slate-700">
                  <Info className="w-3.5 h-3.5 text-indigo-600 shrink-0 mt-0.5" />
                  <div>
                    {selectedCode === 'all' ? (
                      <span>
                        <strong>{filterEvalSummary.evaluatedCount}</strong> compétence(s) évaluée(s) (moy. classe &gt; 0) sur {filterEvalSummary.totalCount} dans ce filtre.
                      </span>
                    ) : (
                      <div className="space-y-0.5">
                        {filterEvalSummary.evalInfos.map(info => (
                          <div key={info.comp.id}>
                            <span className="font-bold">{info.grade}</span> :{' '}
                            {info.isEvaluated ? (
                              <span className="text-emerald-700 font-semibold">
                                moy. {info.classAvg.toFixed(1)}/10 — les 0/10 comptent
                              </span>
                            ) : (
                              <span className="text-amber-700 font-semibold">
                                moy. 0/10 — non évalué (repli automatique)
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <label className="flex items-center gap-2 pt-1 border-t border-slate-200 text-slate-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={requireQuarterNonZero}
                    onChange={e => setRequireQuarterNonZero(e.target.checked)}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>Exiger au moins 25 % d'élèves &gt; 0 (utile en cours de correction)</span>
                </label>
              </div>
            </div>

            {/* 2. Format & Différenciation */}
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  2. Taille & Différenciation
                </h4>
                <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs">
                  <button
                    type="button"
                    onClick={() => setGroupSize(2)}
                    className={`px-2.5 py-1 rounded-md font-bold transition ${
                      groupSize === 2 ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Binômes (2)
                  </button>
                  <button
                    type="button"
                    onClick={() => setGroupSize(4)}
                    className={`px-2.5 py-1 rounded-md font-bold transition ${
                      groupSize === 4 ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Équipes (4)
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setMode('homogeneous')}
                  className={`p-2.5 rounded-xl border text-left transition ${
                    mode === 'homogeneous'
                      ? 'bg-indigo-50 border-indigo-500 ring-1 ring-indigo-500'
                      : 'bg-white border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <div className="text-xs font-bold text-slate-800">Homogène</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Groupes de niveau / besoin
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setMode('heterogeneous')}
                  className={`p-2.5 rounded-xl border text-left transition ${
                    mode === 'heterogeneous'
                      ? 'bg-indigo-50 border-indigo-500 ring-1 ring-indigo-500'
                      : 'bg-white border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <div className="text-xs font-bold text-slate-800">Hétérogène</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    {groupSize === 2 ? 'Tutorat (demi-glissement)' : 'Îlots équilibrés (serpentin)'}
                  </div>
                </button>
              </div>

              <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-200 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                    <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-600" />
                    Écart max conseillé
                  </span>
                  <span className="font-bold text-indigo-700">{customMaxGap.toFixed(1)} pts / 10</span>
                </div>
                <input
                  type="range"
                  min={0.5}
                  max={8}
                  step={0.5}
                  value={customMaxGap}
                  onChange={e => setCustomMaxGap(Number(e.target.value))}
                  className="w-full accent-indigo-600 cursor-pointer"
                />
              </div>

              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="font-semibold text-slate-600">Effectif non multiple :</span>
                <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                  <button
                    type="button"
                    onClick={() => setRemainderHandling('adjust')}
                    className={`px-2 py-1 rounded-md font-semibold transition ${
                      remainderHandling === 'adjust'
                        ? 'bg-white text-indigo-700 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {groupSize === 2 ? '1 trinôme' : 'Équipes 3–5'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setRemainderHandling('reduced')}
                    className={`px-2 py-1 rounded-md font-semibold transition ${
                      remainderHandling === 'reduced'
                        ? 'bg-white text-indigo-700 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {groupSize === 2 ? '1 solo' : 'Groupe réduit'}
                  </button>
                </div>
              </div>
            </div>

            {/* 3. Élèves présents */}
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex flex-col">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5 pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    3. Présents
                  </h4>
                  <span className="text-xs font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
                    {presentCount} / {activeStudents.length}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={selectAllClass}
                    className="text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-2 py-1 rounded border border-indigo-200 transition"
                  >
                    Toute la classe
                  </button>
                  <button
                    type="button"
                    onClick={deselectAllClass}
                    className="text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 px-2 py-1 rounded border border-slate-200 transition"
                  >
                    Aucun
                  </button>
                </div>
              </div>

              {fallbackCount > 0 && (
                <div className="mb-2 px-2.5 py-1 rounded-md bg-amber-50 border border-amber-200 text-[11px] font-medium text-amber-800">
                  {fallbackCount} élève(s) utilisent un repli (moyenne du sous-domaine ou domaine).
                </div>
              )}

              <div className="overflow-y-auto max-h-52 divide-y divide-slate-100 pr-1">
                {activeStudents.map(student => {
                  const isChecked = presentIds.has(student.id);
                  const resolved = resolvedStudentsMap.get(student.id);

                  return (
                    <label
                      key={student.id}
                      className={`flex items-center justify-between py-1.5 px-2 rounded-lg cursor-pointer transition ${
                        isChecked ? 'hover:bg-indigo-50/50' : 'opacity-55 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleStudentPresence(student.id)}
                          className="sr-only"
                        />
                        {isChecked ? (
                          <CheckSquare className="w-4 h-4 text-indigo-600 shrink-0" />
                        ) : (
                          <Square className="w-4 h-4 text-slate-400 shrink-0" />
                        )}
                        <span className="text-xs font-bold text-slate-800 truncate">
                          {student.lastName} {student.firstName}
                        </span>
                        {selectedGrade === 'all' && (
                          <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded shrink-0">
                            {student.grade}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0 ml-2">
                        {resolved?.score !== null && resolved?.score !== undefined ? (
                          <>
                            <span
                              className={`text-xs font-bold px-2 py-0.5 rounded border ${getScoreBadgeClass(
                                resolved.score
                              )}`}
                            >
                              {resolved.score}/10
                            </span>
                            {resolved.fallbackSource !== 'none' && (
                              <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">
                                {resolved.fallbackSource === 'subdomain' ? 'S-dom' : 'Dom'}
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="text-[11px] text-slate-400 italic">Non évalué</span>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={generateGroups}
                disabled={presentCount === 0}
                className="mt-3 w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-xl text-sm font-bold shadow transition flex items-center justify-center gap-2"
              >
                <Shuffle className="w-4 h-4" />
                {`Générer les ${groupSize === 2 ? 'binômes' : 'équipes'} ${
                  mode === 'homogeneous' ? 'homogènes' : 'hétérogènes'
                }`}
              </button>
            </div>
          </div>

          {/* Colonne Droite : Résultat & Ajustement */}
          <div className="lg:col-span-7 bg-white rounded-xl border border-slate-200 p-5 shadow-sm flex flex-col min-h-[420px]">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-100">
              <div>
                <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-indigo-600" />
                  4. {groupSize === 2 ? 'Binômes' : 'Équipes'} proposés ({groups.length})
                </h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  Cliquez sur deux élèves pour les échanger.
                  {groupSize === 4 && interTeamAvgSpread !== null && mode === 'heterogeneous' && (
                    <span className="ml-1.5 font-semibold text-indigo-700">
                      Écart max entre moyennes d'équipes : {interTeamAvgSpread} pt
                    </span>
                  )}
                </p>
              </div>

              {hasGenerated && groups.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowScoresInPrep(prev => !prev)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg border border-slate-200 transition"
                  >
                    {showScoresInPrep ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    {showScoresInPrep ? 'Masquer scores' : 'Afficher scores'}
                  </button>

                  <button
                    type="button"
                    onClick={handleCopyText}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg border border-slate-200 transition"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? 'Copié' : 'Copier'}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setShowScoresInTni(false); // Masqué par défaut en TNI
                      setIsTniMode(true);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-slate-800 hover:bg-slate-900 text-white rounded-lg shadow-sm transition"
                  >
                    <Monitor className="w-3.5 h-3.5" />
                    Affichage TNI
                  </button>
                </div>
              )}
            </div>

            {!hasGenerated ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center py-12 px-6 text-slate-400">
                <Users className="w-12 h-12 text-slate-300 mb-3" />
                <p className="text-sm font-semibold text-slate-600">
                  Sélectionnez vos filtres et vos présents puis cliquez sur Générer
                </p>
                <p className="text-xs text-slate-500 mt-1 max-w-md">
                  Les chapitres ayant une moyenne de classe &gt; 0 intègrent les 0/10 comme résultats effectifs. Les chapitres encore à 0 sont ignorés.
                </p>
              </div>
            ) : groups.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-sm text-slate-500 py-12">
                Aucun élève présent sélectionné.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 overflow-y-auto pr-1">
                {groups.map((group, groupIdx) => {
                  const metrics = getGroupMetrics(group);
                  return (
                    <div
                      key={group.id}
                      className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 flex flex-col gap-2.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 rounded-md">
                          {getGroupTitle(group, groupIdx)}
                        </span>

                        {showScoresInPrep && (
                          <div className="flex items-center gap-1.5 flex-wrap justify-end">
                            {metrics.avg !== null && groupSize === 4 && (
                              <span className="text-[11px] font-bold text-slate-600">
                                Moy. {metrics.avg}
                              </span>
                            )}
                            {metrics.gap !== null && (
                              <span className="text-[11px] font-bold text-slate-500">
                                Δ {metrics.gap}
                              </span>
                            )}
                            {metrics.status === 'optimal' && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded">
                                <CheckCircle2 className="w-3 h-3" />
                                {metrics.label}
                              </span>
                            )}
                            {metrics.status === 'warning' && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded">
                                <AlertTriangle className="w-3 h-3" />
                                {metrics.label}
                              </span>
                            )}
                            {metrics.status === 'info' && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-sky-100 text-sky-800 px-2 py-0.5 rounded">
                                {metrics.label}
                              </span>
                            )}
                            {metrics.status === 'neutral' && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-slate-200 text-slate-700 px-2 py-0.5 rounded">
                                {metrics.label}
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="space-y-1.5">
                        {group.members.map((member, memberIdx) => {
                          const isSelected =
                            swapSelection?.groupIdx === groupIdx &&
                            swapSelection?.memberIdx === memberIdx;

                          return (
                            <button
                              key={member.student.id}
                              type="button"
                              onClick={() => handleMemberClickForSwap(groupIdx, memberIdx)}
                              className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-left transition ${
                                isSelected
                                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                                  : 'bg-white text-slate-800 border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/40'
                              }`}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <ArrowLeftRight
                                  className={`w-3.5 h-3.5 shrink-0 ${
                                    isSelected ? 'text-indigo-200' : 'text-slate-400'
                                  }`}
                                />
                                <span className="text-xs font-bold truncate">
                                  {member.student.firstName} {member.student.lastName}
                                </span>
                                {selectedGrade === 'all' && (
                                  <span
                                    className={`text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${
                                      isSelected
                                        ? 'bg-indigo-500 text-white'
                                        : 'bg-slate-100 text-slate-500'
                                    }`}
                                  >
                                    {member.student.grade}
                                  </span>
                                )}
                              </div>

                              {showScoresInPrep && (
                                <div className="flex items-center gap-1 shrink-0">
                                  <span
                                    className={`text-xs font-bold px-1.5 py-0.5 rounded border ${
                                      isSelected
                                        ? 'bg-indigo-500 text-white border-indigo-400'
                                        : getScoreBadgeClass(member.score)
                                    }`}
                                  >
                                    {member.score !== null ? `${member.score}/10` : '—'}
                                  </span>
                                  {member.fallbackSource !== 'none' && (
                                    <span
                                      className={`text-[10px] font-bold px-1 rounded ${
                                        isSelected
                                          ? 'bg-indigo-500 text-white'
                                          : 'bg-amber-100 text-amber-800'
                                      }`}
                                    >
                                      {member.fallbackSource === 'subdomain' ? 'S-dom' : 'Dom'}
                                    </span>
                                  )}
                                </div>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
