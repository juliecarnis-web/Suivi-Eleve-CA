import React, { useState, useMemo, useEffect } from 'react';
import {
  Compass,
  Users,
  Search,
  CheckSquare,
  Square,
  Monitor,
  UserCheck,
  Sparkles,
  CheckCircle2,
  Award,
  Layers,
  Plus,
  Lock,
  AlertCircle,
  X,
  CheckCheck,
  Target
} from 'lucide-react';
import {
  Student,
  Competence,
  Result,
  CurriculumItem,
  CurriculumResult
} from '../types';
import { cn, getDomain, getGrade, createDomainSorter } from '../utils/helpers';
import { getEvaluatedCompetenceMap } from '../utils/bilanGenerator';
import {
  buildAutonomieProfiles,
  findExpertsForChapter,
  getDefaultAutonomieAssignment,
  AutonomieAssignment
} from '../utils/autonomieRecommender';
import AutonomieTniModal, { TniPlanItem } from './AutonomieTniModal';
import ExpertBadge from './ExpertBadge';

interface AutonomieTabProps {
  activeStudents: Student[];
  competences: Competence[];
  results: Record<string, Record<number, Result>>;
  uniqueGrades: string[];
  curriculumItems?: CurriculumItem[];
  curriculumResults?: CurriculumResult[];
  isEditMode: boolean;
  handleToggleEditMode: () => void;
  upsertResult: (
    studentId: string,
    competenceId: number,
    updates: Partial<Pick<Result, 'score' | 'isStarted'>>
  ) => Promise<void>;
}

interface CheckedSequence extends AutonomieAssignment {
  itemKey: string;
}

export default function AutonomieTab({
  activeStudents,
  competences,
  results,
  uniqueGrades,
  curriculumItems = [],
  curriculumResults = [],
  isEditMode,
  handleToggleEditMode,
  upsertResult
}: AutonomieTabProps) {
  const [gradeFilter, setGradeFilter] = useState<string>('all');
  const [domainFilter, setDomainFilter] = useState<string>('all');
  const [subDomainFilter, setSubDomainFilter] = useState<string>('all');
  const [soloMinScore, setSoloMinScore] = useState<3 | 4>(4);
  const [allowCrossGrade, setAllowCrossGrade] = useState<boolean>(false);

  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // Seules les séquences explicitement cochées par l'enseignante apparaissent au TNI
  const [checkedByStudent, setCheckedByStudent] = useState<Record<string, CheckedSequence[]>>({});
  const [rightMode, setRightMode] = useState<'students' | 'expert_finder'>('students');
  const [finderLearnerId, setFinderLearnerId] = useState<string>('');
  const [finderCompId, setFinderCompId] = useState<number | null>(null);
  const [isTniOpen, setIsTniOpen] = useState<boolean>(false);
  const [flashMessage, setFlashMessage] = useState<string>('');

  const sortDomains = useMemo(() => createDomainSorter(competences), [competences]);

  const uniqueDomains = useMemo(
    () => Array.from(new Set(competences.map(c => getDomain(c)).filter(Boolean))).sort(sortDomains),
    [competences, sortDomains]
  );

  const uniqueSubDomains = useMemo(() => {
    const set = new Set<string>();
    competences.forEach(c => {
      if (gradeFilter !== 'all' && getGrade(c) !== gradeFilter) return;
      if (domainFilter !== 'all' && getDomain(c) !== domainFilter) return;
      const sd = (c.subDomain || '').trim() || 'Général';
      set.add(sd);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'fr'));
  }, [competences, gradeFilter, domainFilter]);

  useEffect(() => {
    if (subDomainFilter !== 'all' && !uniqueSubDomains.includes(subDomainFilter)) {
      setSubDomainFilter('all');
    }
  }, [uniqueSubDomains, subDomainFilter]);

  const evaluatedCompMap = useMemo(
    () => getEvaluatedCompetenceMap(activeStudents, competences, results),
    [activeStudents, competences, results]
  );

  const visibleStudents = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return activeStudents
      .filter(s => gradeFilter === 'all' || s.grade === gradeFilter)
      .filter(s => {
        if (!q) return true;
        return `${s.firstName} ${s.lastName}`.toLowerCase().includes(q);
      })
      .sort((a, b) => a.lastName.localeCompare(b.lastName, 'fr') || a.firstName.localeCompare(b.firstName, 'fr'));
  }, [activeStudents, gradeFilter, searchTerm]);

  const studentQuickStats = useMemo(() => {
    const map = new Map<string, { blocking: number; solo: number }>();
    activeStudents.forEach(s => {
      let blocking = 0;
      let solo = 0;
      competences.forEach(c => {
        if (!evaluatedCompMap.has(c.id)) return;
        if (getGrade(c) !== s.grade) return;
        if (domainFilter !== 'all' && getDomain(c) !== domainFilter) return;
        if (subDomainFilter !== 'all') {
          const sd = (c.subDomain || '').trim() || 'Général';
          if (sd !== subDomainFilter) return;
        }

        const res = results[s.id]?.[c.id];
        if (!res || !res.isStarted || res.score === null || res.score === undefined) return;
        const sc = Number(res.score);
        if (sc >= soloMinScore && sc < 5) solo++;
        if (sc >= 0 && sc <= 3) blocking++;
      });
      map.set(s.id, { blocking, solo });
    });
    return map;
  }, [activeStudents, competences, results, evaluatedCompMap, domainFilter, subDomainFilter, soloMinScore]);

  const selectedStudents = useMemo(
    () =>
      activeStudents
        .filter(s => selectedIds.has(s.id))
        .sort((a, b) => a.lastName.localeCompare(b.lastName, 'fr') || a.firstName.localeCompare(b.firstName, 'fr')),
    [activeStudents, selectedIds]
  );

  const profiles = useMemo(
    () =>
      buildAutonomieProfiles(
        selectedStudents,
        activeStudents,
        competences,
        results,
        curriculumItems,
        curriculumResults,
        {
          domainFilter,
          subDomainFilter,
          soloMinScore
        },
        evaluatedCompMap
      ),
    [
      selectedStudents,
      activeStudents,
      competences,
      results,
      curriculumItems,
      curriculumResults,
      domainFilter,
      subDomainFilter,
      soloMinScore,
      evaluatedCompMap
    ]
  );

  // Comptage de sollicitation des expert(e)s sur les séquences cochées
  const expertUsageMap = useMemo(() => {
    const map = new Map<string, string[]>();
    selectedStudents.forEach(st => {
      const list = checkedByStudent[st.id] || [];
      list.forEach(item => {
        if (item.mode === 'tutor' && item.expertId) {
          const names = map.get(item.expertId) || [];
          if (!names.includes(st.firstName)) {
            names.push(st.firstName);
          }
          map.set(item.expertId, names);
        }
      });
    });
    return map;
  }, [selectedStudents, checkedByStudent]);

  const studentById = useMemo(
    () => new Map(activeStudents.map(s => [s.id, s])),
    [activeStudents]
  );

  const toggleStudent = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectVisible = () => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      visibleStudents.forEach(s => next.add(s.id));
      return next;
    });
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  const toggleCheckedSequence = (studentId: string, item: CheckedSequence) => {
    setCheckedByStudent(prev => {
      const currentList = prev[studentId] || [];
      const exists = currentList.some(c => c.itemKey === item.itemKey);
      const nextList = exists
        ? currentList.filter(c => c.itemKey !== item.itemKey)
        : [...currentList, item];
      return {
        ...prev,
        [studentId]: nextList
      };
    });
  };

  const updateCheckedItemExpert = (studentId: string, itemKey: string, expertId: string | null) => {
    setCheckedByStudent(prev => {
      const currentList = prev[studentId] || [];
      return {
        ...prev,
        [studentId]: currentList.map(c => (c.itemKey === itemKey ? { ...c, expertId } : c))
      };
    });
  };

  const handlePrecheckOnePerStudent = () => {
    const next: Record<string, CheckedSequence[]> = { ...checkedByStudent };
    const expertLoad = new Map<string, number>();

    profiles.forEach(profile => {
      if ((next[profile.student.id] || []).length > 0) return;

      const base = getDefaultAutonomieAssignment(
        profile,
        activeStudents,
        selectedIds,
        competences,
        results,
        allowCrossGrade
      );

      if (base.mode === 'expert_helper') {
        next[profile.student.id] = [
          {
            ...base,
            itemKey: 'expert_helper'
          }
        ];
        return;
      }

      if (base.mode === 'tutor' && profile.blockingChapters[0]) {
        const ch = profile.blockingChapters[0];
        const candidates = findExpertsForChapter(
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
        const balanced = [...candidates].sort((a, b) => {
          const loadA = expertLoad.get(a.student.id) || 0;
          const loadB = expertLoad.get(b.student.id) || 0;
          return loadA - loadB;
        });
        const picked = balanced[0]?.student.id ?? null;
        if (picked) expertLoad.set(picked, (expertLoad.get(picked) || 0) + 1);
        next[profile.student.id] = [
          {
            ...base,
            expertId: picked,
            itemKey: `tutor_${ch.competence.id}`
          }
        ];
        return;
      }

      const key =
        base.mode === 'solo' && base.competenceId !== null
          ? `solo_${base.competenceId}`
          : `curr_${base.chapterCode}`;
      next[profile.student.id] = [{ ...base, itemKey: key }];
    });

    setCheckedByStudent(next);
    setFlashMessage('1 suggestion pré-cochée pour chaque élève qui n’avait encore rien de coché.');
    setTimeout(() => setFlashMessage(''), 3000);
  };

  const handleClearAllChecked = () => {
    setCheckedByStudent({});
    setFlashMessage('Toutes les séquences ont été décochées.');
    setTimeout(() => setFlashMessage(''), 2500);
  };

  const handleQuickIncrementScore = async (student: Student, item: CheckedSequence) => {
    if (!isEditMode || item.competenceId === null || item.currentScore === null) return;
    const nextScore = Math.min(10, item.currentScore + 1);
    await upsertResult(student.id, item.competenceId, {
      score: nextScore,
      isStarted: true
    });
    setCheckedByStudent(prev => {
      const list = prev[student.id] || [];
      return {
        ...prev,
        [student.id]: list.map(entry =>
          entry.itemKey === item.itemKey ? { ...entry, currentScore: nextScore } : entry
        )
      };
    });
    setFlashMessage(
      `${student.firstName} : +1 réussite enregistrée sur ${item.chapterCode} (${nextScore}/5${nextScore >= 5 ? ' — Validé !' : ''}).`
    );
    setTimeout(() => setFlashMessage(''), 3000);
  };

  // Seules les séquences cochées des élèves sélectionnés passent au TNI
  const tniItems: TniPlanItem[] = useMemo(() => {
    const items: TniPlanItem[] = [];
    selectedStudents.forEach(student => {
      const checkedList = checkedByStudent[student.id] || [];
      checkedList.forEach(item => {
        const expert = item.expertId ? studentById.get(item.expertId) || null : null;
        items.push({
          itemKey: `${student.id}_${item.itemKey}`,
          student,
          assignment: item,
          expert
        });
      });
    });
    return items;
  }, [selectedStudents, checkedByStudent, studentById]);

  const soloCount = tniItems.filter(i => i.assignment.mode === 'solo' || i.assignment.mode === 'curriculum').length;
  const tutorCount = tniItems.filter(i => i.assignment.mode === 'tutor').length;
  const overloadedExperts = Array.from(expertUsageMap.entries()).filter(([, learners]) => learners.length > 1);

  // Données pour le mode dédié "Recherche d'expert(e)"
  const finderLearnersPool = useMemo(() => {
    const base = selectedStudents.length > 0 ? selectedStudents : visibleStudents;
    return [...base].sort(
      (a, b) => a.lastName.localeCompare(b.lastName, 'fr') || a.firstName.localeCompare(b.firstName, 'fr')
    );
  }, [selectedStudents, visibleStudents]);

  const effectiveFinderLearner = useMemo(() => {
    if (finderLearnersPool.length === 0) return null;
    return finderLearnersPool.find(s => s.id === finderLearnerId) || finderLearnersPool[0];
  }, [finderLearnersPool, finderLearnerId]);

  const finderLearnerBlockingChapters = useMemo(() => {
    if (!effectiveFinderLearner) return [];
    const built = buildAutonomieProfiles(
      [effectiveFinderLearner],
      activeStudents,
      competences,
      results,
      curriculumItems,
      curriculumResults,
      { domainFilter, subDomainFilter, soloMinScore },
      evaluatedCompMap
    );
    return built[0]?.blockingChapters || [];
  }, [
    effectiveFinderLearner,
    activeStudents,
    competences,
    results,
    curriculumItems,
    curriculumResults,
    domainFilter,
    subDomainFilter,
    soloMinScore,
    evaluatedCompMap
  ]);

  const effectiveFinderChapter = useMemo(() => {
    if (finderLearnerBlockingChapters.length === 0) return null;
    return (
      finderLearnerBlockingChapters.find(ch => ch.competence.id === finderCompId) ||
      finderLearnerBlockingChapters[0]
    );
  }, [finderLearnerBlockingChapters, finderCompId]);

  const finderExperts = useMemo(() => {
    if (!effectiveFinderLearner || !effectiveFinderChapter) return [];
    return findExpertsForChapter(
      {
        competenceId: effectiveFinderChapter.competence.id,
        grade: effectiveFinderChapter.grade,
        domain: effectiveFinderChapter.domain,
        subDomain: effectiveFinderChapter.subDomain,
        code: effectiveFinderChapter.code,
        title: effectiveFinderChapter.title
      },
      effectiveFinderLearner.id,
      activeStudents,
      selectedIds,
      competences,
      results,
      allowCrossGrade
    );
  }, [
    effectiveFinderLearner,
    effectiveFinderChapter,
    activeStudents,
    selectedIds,
    competences,
    results,
    allowCrossGrade
  ]);

  const handleAssignFromFinder = (
    learner: Student,
    chapter: (typeof finderLearnerBlockingChapters)[number],
    expertId: string | null
  ) => {
    const itemKey = `tutor_${chapter.competence.id}`;
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.add(learner.id);
      return next;
    });
    setCheckedByStudent(prev => {
      const list = prev[learner.id] || [];
      const newEntry: CheckedSequence = {
        itemKey,
        mode: 'tutor',
        competenceId: chapter.competence.id,
        chapterCode: chapter.code,
        chapterTitle: chapter.title,
        domain: chapter.domain,
        subDomain: chapter.subDomain,
        currentScore: chapter.score,
        expertId
      };
      const exists = list.some(c => c.itemKey === itemKey);
      return {
        ...prev,
        [learner.id]: exists
          ? list.map(c => (c.itemKey === itemKey ? newEntry : c))
          : [...list, newEntry]
      };
    });
    const expName = expertId ? studentById.get(expertId)?.firstName : 'l’enseignante';
    setFlashMessage(
      `${learner.firstName} associé(e) à ${expName} sur ${chapter.code} et coché pour le TNI.`
    );
    setTimeout(() => setFlashMessage(''), 3500);
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">
      {/* Barre de filtres en cascade + Affichage TNI */}
      <div className="bg-white border-b border-slate-200 px-6 py-3 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-slate-600 whitespace-nowrap">Niveau</label>
            <select
              value={gradeFilter}
              onChange={e => setGradeFilter(e.target.value)}
              className="px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded text-xs font-semibold focus:ring-2 focus:ring-indigo-500 outline-none"
            >
              <option value="all">Tous</option>
              {uniqueGrades.map(g => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-slate-600 whitespace-nowrap">Domaine</label>
            <select
              value={domainFilter}
              onChange={e => {
                setDomainFilter(e.target.value);
                setSubDomainFilter('all');
              }}
              className="px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded text-xs font-semibold focus:ring-2 focus:ring-indigo-500 outline-none max-w-[200px]"
            >
              <option value="all">Tous les domaines</option>
              {uniqueDomains.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-slate-600 whitespace-nowrap">Sous-domaine</label>
            <select
              value={subDomainFilter}
              onChange={e => setSubDomainFilter(e.target.value)}
              className="px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded text-xs font-semibold focus:ring-2 focus:ring-indigo-500 outline-none max-w-[220px]"
            >
              <option value="all">Tous les sous-domaines</option>
              {uniqueSubDomains.map(sd => (
                <option key={sd} value={sd}>{sd}</option>
              ))}
            </select>
          </div>

          <label
            className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 bg-slate-50 border border-slate-200 px-2.5 py-1.5 rounded-md cursor-pointer"
            title="Par défaut, seuls les chapitres à 4/5 sont proposés en autonomie seule (et 0–3/5 en tutorat). Cochez pour inclure aussi les 3/5 en solo."
          >
            <input
              type="checkbox"
              checked={soloMinScore === 3}
              onChange={e => setSoloMinScore(e.target.checked ? 3 : 4)}
              className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
            />
            <span>Inclure 3/5 en solo</span>
          </label>

          <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 bg-slate-50 border border-slate-200 px-2.5 py-1.5 rounded-md cursor-pointer">
            <input
              type="checkbox"
              checked={allowCrossGrade}
              onChange={e => setAllowCrossGrade(e.target.checked)}
              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span>Expert(e)s multi-niveaux</span>
          </label>
        </div>

        <div className="flex items-center gap-2">
          {selectedStudents.length > 0 && (
            <>
              <button
                type="button"
                onClick={handlePrecheckOnePerStudent}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-white text-slate-700 border border-slate-300 hover:bg-slate-100 transition"
                title="Pré-cocher automatiquement 1 séquence par élève non encore coché"
              >
                <CheckCheck className="w-3.5 h-3.5 text-indigo-600" />
                Pré-cocher 1 / élève
              </button>
              {tniItems.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearAllChecked}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-semibold bg-white text-slate-600 border border-slate-300 hover:bg-slate-100 transition"
                >
                  Tout décocher
                </button>
              )}
            </>
          )}
          <button
            type="button"
            onClick={() => setIsTniOpen(true)}
            disabled={tniItems.length === 0}
            title={
              tniItems.length === 0
                ? 'Cochez au moins une séquence à travailler pour l’afficher au TNI'
                : 'Ouvrir l’affichage TNI pour les séquences cochées'
            }
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs font-bold bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white shadow-sm transition"
          >
            <Monitor className="w-4 h-4" />
            Affichage TNI ({tniItems.length})
          </button>
        </div>
      </div>

      {/* Corps principal en 2 colonnes */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Colonne gauche : sélection des élèves */}
          <div className="lg:col-span-4 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            <div className="px-4 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-indigo-600" />
                <h2 className="text-sm font-bold text-slate-800">
                  Élèves en autonomie ({selectedStudents.length})
                </h2>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={selectVisible}
                  className="text-[11px] font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-2 py-1 rounded border border-indigo-200 transition"
                >
                  Cocher liste
                </button>
                <button
                  type="button"
                  onClick={clearSelection}
                  className="text-[11px] font-semibold text-slate-600 bg-white hover:bg-slate-100 px-2 py-1 rounded border border-slate-200 transition"
                >
                  Aucun
                </button>
              </div>
            </div>

            <div className="p-3 border-b border-slate-100">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder="Rechercher un élève..."
                  className="w-full pl-9 pr-3 py-1.5 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
            </div>

            <div className="divide-y divide-slate-100 max-h-[66vh] overflow-y-auto p-1.5">
              {visibleStudents.map(student => {
                const isChecked = selectedIds.has(student.id);
                const stats = studentQuickStats.get(student.id) || { blocking: 0, solo: 0 };
                const helpingList = expertUsageMap.get(student.id) || [];
                const studentTniCount = (checkedByStudent[student.id] || []).length;

                return (
                  <label
                    key={student.id}
                    className={cn(
                      'flex items-center justify-between gap-2 px-3 py-2 rounded-lg cursor-pointer transition',
                      isChecked ? 'bg-indigo-50/70 hover:bg-indigo-50' : 'hover:bg-slate-50'
                    )}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={isChecked}
                        onChange={() => toggleStudent(student.id)}
                      />
                      {isChecked ? (
                        <CheckSquare className="w-4 h-4 text-indigo-600 shrink-0" />
                      ) : (
                        <Square className="w-4 h-4 text-slate-400 shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-800 truncate">
                          {student.firstName} <span className="uppercase">{student.lastName}</span>
                          {studentTniCount > 0 && (
                            <span className="ml-1.5 text-[10px] font-extrabold text-emerald-700">
                              • {studentTniCount} TNI
                            </span>
                          )}
                        </p>
                        {helpingList.length > 0 && (
                          <p className="text-[10px] font-semibold text-violet-700 truncate">
                            Expert(e) avec {helpingList.join(', ')}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {stats.solo > 0 && (
                        <span
                          className="text-[10px] font-bold text-emerald-800 bg-emerald-100 border border-emerald-200 px-1.5 py-0.5 rounded"
                          title={`${stats.solo} chapitre(s) à valider en autonomie`}
                        >
                          {stats.solo} solo
                        </span>
                      )}
                      {stats.blocking > 0 && (
                        <span
                          className="text-[10px] font-bold text-indigo-800 bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 rounded"
                          title={`${stats.blocking} chapitre(s) entre 0 et 3 à débloquer (NE exclus)`}
                        >
                          {stats.blocking} à débloquer
                        </span>
                      )}
                      <span className="text-[10px] font-bold text-slate-600 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded">
                        {student.grade}
                      </span>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Colonne droite : Par élève OU Recherche d'expert(e) */}
          <div className="lg:col-span-8 space-y-5">
            {/* Sélecteur explicite de mode en haut à droite */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center bg-slate-100 p-1 rounded-lg border border-slate-200">
                <button
                  type="button"
                  onClick={() => setRightMode('students')}
                  className={cn(
                    'px-3.5 py-1.5 rounded-md text-xs font-bold transition flex items-center gap-1.5',
                    rightMode === 'students'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  )}
                >
                  <Target className="w-3.5 h-3.5" />
                  Par élève ({selectedStudents.length})
                </button>
                <button
                  type="button"
                  onClick={() => setRightMode('expert_finder')}
                  className={cn(
                    'px-3.5 py-1.5 rounded-md text-xs font-bold transition flex items-center gap-1.5',
                    rightMode === 'expert_finder'
                      ? 'bg-violet-700 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  )}
                >
                  <UserCheck className="w-3.5 h-3.5" />
                  Recherche d’expert(e)
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="inline-flex items-center gap-1.5 font-bold text-slate-700 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-md">
                  <Monitor className="w-3.5 h-3.5 text-indigo-600" />
                  {tniItems.length} cochée{tniItems.length > 1 ? 's' : ''} TNI
                </span>
                {soloCount > 0 && (
                  <span className="inline-flex items-center gap-1 font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-md">
                    <Sparkles className="w-3 h-3 text-emerald-600" />
                    {soloCount} seul(e)
                  </span>
                )}
                {tutorCount > 0 && (
                  <span className="inline-flex items-center gap-1 font-bold text-indigo-800 bg-indigo-50 border border-indigo-200 px-2 py-1 rounded-md">
                    <UserCheck className="w-3 h-3 text-indigo-600" />
                    {tutorCount} binôme
                  </span>
                )}
              </div>
            </div>

            {flashMessage && (
              <div className="text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{flashMessage}</span>
              </div>
            )}

            {rightMode === 'expert_finder' ? (
              <div className="bg-white rounded-xl border border-violet-200 shadow-sm p-5 space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-800 flex items-center gap-2">
                      <UserCheck className="w-4 h-4 text-violet-700" />
                      Recherche ciblée d’un(e) élève expert(e)
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Choisissez un élève et un chapitre bloquant (0–3 réussites, hors NE) pour afficher immédiatement les expert(e)s disponibles.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] font-semibold">
                    <span className="px-2 py-0.5 rounded border bg-emerald-100 text-emerald-800 border-emerald-300">
                      Vert : 5/5
                    </span>
                    <span className="px-2 py-0.5 rounded border bg-emerald-800 text-white border-emerald-900">
                      Vert foncé : &gt; 5/5
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      1. Élève à accompagner
                    </label>
                    <select
                      value={effectiveFinderLearner?.id || ''}
                      onChange={e => {
                        setFinderLearnerId(e.target.value);
                        setFinderCompId(null);
                      }}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-800 focus:ring-2 focus:ring-violet-500 outline-none"
                    >
                      {finderLearnersPool.map(s => (
                        <option key={s.id} value={s.id}>
                          {s.firstName} {s.lastName.toUpperCase()} ({s.grade})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      2. Chapitre bloquant (0–3/5, NE exclus)
                    </label>
                    {finderLearnerBlockingChapters.length === 0 ? (
                      <div className="px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg text-xs font-semibold text-emerald-800">
                        Aucun chapitre entre 0 et 3 pour cet élève dans ce filtre.
                      </div>
                    ) : (
                      <select
                        value={effectiveFinderChapter?.competence.id || ''}
                        onChange={e => setFinderCompId(Number(e.target.value))}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-800 focus:ring-2 focus:ring-violet-500 outline-none"
                      >
                        {finderLearnerBlockingChapters.map(ch => (
                          <option key={ch.competence.id} value={ch.competence.id}>
                            {ch.code} — {ch.title} ({ch.score}/5)
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>

                {effectiveFinderLearner && effectiveFinderChapter && (
                  <div className="space-y-3 pt-2 border-t border-slate-100">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-xs font-bold text-slate-700">
                        Expert(e)s disponibles sur{' '}
                        <span className="font-mono text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200">
                          {effectiveFinderChapter.code}
                        </span>{' '}
                        <span className="font-semibold text-slate-500">
                          ({effectiveFinderChapter.title})
                        </span>
                      </div>
                      <span className="text-[11px] font-bold text-violet-800 bg-violet-50 border border-violet-200 px-2 py-0.5 rounded">
                        {finderExperts.length} trouvé{finderExperts.length > 1 ? 's' : ''}
                      </span>
                    </div>

                    {finderExperts.length === 0 ? (
                      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-900 space-y-2">
                        <p>
                          Aucun élève du niveau <strong>{effectiveFinderChapter.grade}</strong> n’a encore validé (≥ 5/5) ce chapitre.
                        </p>
                        <div className="flex flex-wrap items-center gap-2">
                          {!allowCrossGrade && (
                            <button
                              type="button"
                              onClick={() => setAllowCrossGrade(true)}
                              className="px-3 py-1.5 rounded-md font-bold bg-white border border-amber-300 hover:bg-amber-100 text-amber-900 transition"
                            >
                              Chercher aussi dans les autres niveaux
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() =>
                              handleAssignFromFinder(effectiveFinderLearner, effectiveFinderChapter, null)
                            }
                            className="px-3 py-1.5 rounded-md font-bold bg-slate-800 hover:bg-slate-900 text-white transition"
                          >
                            Cocher pour le TNI avec l’enseignante
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                        {finderExperts.map(cand => {
                          const existingEntry = (checkedByStudent[effectiveFinderLearner.id] || []).find(
                            e => e.itemKey === `tutor_${effectiveFinderChapter.competence.id}`
                          );
                          const isAlreadyPaired = existingEntry?.expertId === cand.student.id;
                          const load = (expertUsageMap.get(cand.student.id) || []).filter(
                            n => n !== effectiveFinderLearner.firstName
                          );

                          return (
                            <div
                              key={cand.student.id}
                              className={cn(
                                'rounded-xl border p-3 flex items-center justify-between gap-3 transition',
                                isAlreadyPaired
                                  ? 'bg-violet-50 border-violet-400 ring-1 ring-violet-200'
                                  : 'bg-slate-50/70 border-slate-200 hover:border-violet-300'
                              )}
                            >
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-extrabold text-slate-800 truncate">
                                    {cand.student.firstName}{' '}
                                    <span className="uppercase">{cand.student.lastName}</span>
                                  </span>
                                  <span className="text-[10px] font-bold bg-white border border-slate-200 px-1.5 py-0.5 rounded text-slate-600">
                                    {cand.student.grade}
                                  </span>
                                </div>
                                <div className="flex flex-wrap items-center gap-1.5 mt-1 text-[11px]">
                                  <ExpertBadge
                                    score={cand.score}
                                    compact
                                    suffix={`· ${cand.matchedCode}`}
                                  />
                                  <span
                                    className={cn(
                                      'font-semibold px-1.5 py-0.5 rounded',
                                      load.length > 0
                                        ? 'bg-amber-100 text-amber-800'
                                        : 'bg-white text-slate-600 border border-slate-200'
                                    )}
                                  >
                                    {load.length > 0 ? `Aide déjà ${load.join(', ')}` : 'Disponible'}
                                  </span>
                                </div>
                              </div>

                              <button
                                type="button"
                                onClick={() =>
                                  handleAssignFromFinder(
                                    effectiveFinderLearner,
                                    effectiveFinderChapter,
                                    cand.student.id
                                  )
                                }
                                className={cn(
                                  'px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition shrink-0',
                                  isAlreadyPaired
                                    ? 'bg-violet-700 text-white'
                                    : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                                )}
                              >
                                {isAlreadyPaired ? '✓ Associé (TNI)' : 'Associer + TNI'}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : selectedStudents.length === 0 ? (
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-10 text-center space-y-3">
                <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto border border-indigo-100">
                  <Compass className="w-6 h-6" />
                </div>
                <h3 className="text-base font-bold text-slate-800">
                  Organisez le temps d’autonomie quotidien
                </h3>
                <p className="text-sm text-slate-500 max-w-xl mx-auto">
                  Filtrez par domaine et sous-domaine puis cochez les élèves présents à gauche (ou passez en mode « Recherche d’expert(e) » ci-dessus). Cochez ensuite uniquement les séquences à afficher au TNI.
                </p>
              </div>
            ) : (
              <>
                {/* Bandeau régulation & déverrouillage */}
                {(overloadedExperts.length > 0 || !isEditMode) && (
                  <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3.5 space-y-2.5">
                    {!isEditMode && (
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-slate-500">
                          Cochez les chapitres à projeter au TNI. Pour les besoins 0–3/5, cochez un chapitre pour choisir l’élève expert(e).
                        </span>
                        <button
                          type="button"
                          onClick={handleToggleEditMode}
                          className="text-[11px] font-bold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-2.5 py-1 rounded-md transition inline-flex items-center gap-1.5 shrink-0"
                        >
                          <Lock className="w-3 h-3" />
                          Déverrouiller Saisie (+1)
                        </button>
                      </div>
                    )}

                  {overloadedExperts.length > 0 && (
                    <div className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <span>
                        <strong>Régulation :</strong>{' '}
                        {overloadedExperts
                          .map(([expId, learners]) => {
                            const exp = studentById.get(expId);
                            return `${exp?.firstName || expId} accompagne ${learners.length} camarades (${learners.join(', ')})`;
                          })
                          .join(' • ')}{' '}
                        — vous pouvez sélectionner un(e) autre expert(e) sur la fiche concernée.
                      </span>
                    </div>
                  )}
                </div>
                )}

                {/* Fiches individuelles */}
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                  {profiles.map(profile => {
                    const checkedList = checkedByStudent[profile.student.id] || [];
                    const checkedMap = new Map(checkedList.map(item => [item.itemKey, item]));
                    const helpingNames = expertUsageMap.get(profile.student.id) || [];

                    // Séquences cochées issues éventuellement d'un autre filtre (domaine/sous-domaine)
                    const visibleKeys = new Set<string>([
                      ...profile.soloChapters.map(c => `solo_${c.competence.id}`),
                      ...profile.blockingChapters.map(c => `tutor_${c.competence.id}`),
                      ...profile.curriculumSuggestions.map(s => `curr_${s.item.code}`),
                      'expert_helper'
                    ]);
                    const extraChecked = checkedList.filter(c => !visibleKeys.has(c.itemKey));

                    return (
                      <div
                        key={profile.student.id}
                        className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-col gap-3"
                      >
                        {/* En-tête élève */}
                        <div className="flex items-start justify-between gap-2 pb-2 border-b border-slate-100">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-sm font-extrabold text-slate-800">
                                {profile.student.firstName}{' '}
                                <span className="uppercase">{profile.student.lastName}</span>
                              </h3>
                              <span className="text-[11px] font-bold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                                {profile.student.grade}
                              </span>
                              {helpingNames.length > 0 && (
                                <span className="text-[10px] font-bold text-violet-800 bg-violet-100 border border-violet-200 px-1.5 py-0.5 rounded">
                                  Aide {helpingNames.join(', ')}
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-500 mt-0.5">
                              {profile.evaluatedCount > 0
                                ? `${profile.masteredCount}/${profile.evaluatedCount} validées (≥ 5) dans ce filtre • NE exclus`
                                : 'Aucune séquence évaluée (hors NE) dans ce filtre'}
                            </p>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {checkedList.length > 0 ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-800 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-md">
                                <Monitor className="w-3 h-3" />
                                {checkedList.length} au TNI
                              </span>
                            ) : (
                              <span className="text-[11px] font-semibold text-slate-400 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-md">
                                Non affiché TNI
                              </span>
                            )}
                            {profile.isAllMasteredInFilter && (
                              <span
                                className={cn(
                                  'inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md border',
                                  profile.expertChapters.some(ec => ec.tier === 'expert_over_5')
                                    ? 'text-white bg-emerald-800 border-emerald-900'
                                    : 'text-emerald-800 bg-emerald-100 border-emerald-300'
                                )}
                              >
                                <Award className="w-3.5 h-3.5" />
                                {profile.expertChapters.some(ec => ec.tier === 'expert_over_5')
                                  ? 'Expert+'
                                  : 'Expert(e)'}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Badges Expert obtenus sur les chapitres du filtre */}
                        {profile.expertChapters.length > 0 && (
                          <div className="bg-slate-50/80 border border-slate-200 rounded-lg p-2 space-y-1.5">
                            <div className="flex items-center justify-between gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                              <span>Badges Expert dans ce filtre ({profile.expertChapters.length})</span>
                              <span className="font-semibold normal-case text-slate-500">
                                {profile.expertChapters.filter(ec => ec.tier === 'expert_over_5').length} vert foncé •{' '}
                                {profile.expertChapters.filter(ec => ec.tier === 'expert_5').length} vert
                              </span>
                            </div>
                            <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto pr-0.5">
                              {profile.expertChapters.map(ec => (
                                <span
                                  key={ec.competence.id}
                                  title={`${ec.code} — ${ec.title} (${ec.score}/5)`}
                                  className={cn(
                                    'inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded border tabular-nums',
                                    ec.tier === 'expert_over_5'
                                      ? 'bg-emerald-800 text-white border-emerald-900'
                                      : 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                  )}
                                >
                                  <span className="font-mono">{ec.code}</span>
                                  <span className="opacity-90">· {ec.score}/5</span>
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Séquences déjà cochées sur d'autres filtres */}
                        {extraChecked.length > 0 && (
                          <div className="bg-slate-50 border border-slate-200 rounded-lg p-2 space-y-1">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                              Cochée(s) depuis un autre filtre (affichées au TNI) :
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {extraChecked.map(item => (
                                <span
                                  key={item.itemKey}
                                  className="inline-flex items-center gap-1.5 text-[11px] font-semibold bg-white border border-slate-200 text-slate-700 px-2 py-0.5 rounded"
                                >
                                  <span className="font-mono font-bold text-indigo-700">{item.chapterCode}</span>
                                  {item.expertId && (
                                    <span className="text-violet-700">
                                      (avec {studentById.get(item.expertId)?.firstName})
                                    </span>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => toggleCheckedSequence(profile.student.id, item)}
                                    className="text-slate-400 hover:text-rose-600"
                                    title="Retirer du TNI"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Parcours 1 : Mieux réussis mais non validés (Autonomie seule) */}
                        {profile.soloChapters.length > 0 && (
                          <div className="space-y-1.5">
                            <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">
                              Proche validation — travailler seul(e) ({profile.soloChapters.length})
                            </p>
                            <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                              {profile.soloChapters.map(ch => {
                                const itemKey = `solo_${ch.competence.id}`;
                                const checkedEntry = checkedMap.get(itemKey);
                                const isChecked = Boolean(checkedEntry);
                                const liveScore = checkedEntry?.currentScore ?? ch.score;

                                return (
                                  <div
                                    key={itemKey}
                                    className={cn(
                                      'flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border text-xs transition',
                                      isChecked
                                        ? 'bg-emerald-50 border-emerald-400 ring-1 ring-emerald-200 text-emerald-950'
                                        : 'bg-slate-50/70 hover:bg-emerald-50/50 text-slate-800 border-slate-200'
                                    )}
                                  >
                                    <button
                                      type="button"
                                      onClick={() =>
                                        toggleCheckedSequence(profile.student.id, {
                                          itemKey,
                                          mode: 'solo',
                                          competenceId: ch.competence.id,
                                          chapterCode: ch.code,
                                          chapterTitle: ch.title,
                                          domain: ch.domain,
                                          subDomain: ch.subDomain,
                                          currentScore: ch.score,
                                          expertId: null
                                        })
                                      }
                                      className="flex items-center gap-2 min-w-0 flex-1 text-left"
                                    >
                                      {isChecked ? (
                                        <CheckSquare className="w-4 h-4 text-emerald-700 shrink-0" />
                                      ) : (
                                        <Square className="w-4 h-4 text-slate-400 shrink-0" />
                                      )}
                                      <span className="truncate">
                                        <strong className="font-mono text-emerald-900">{ch.code}</strong> — {ch.title}
                                      </span>
                                    </button>

                                    <div className="flex items-center gap-1.5 shrink-0">
                                      {isChecked && (
                                        <button
                                          type="button"
                                          disabled={!isEditMode}
                                          onClick={() =>
                                            handleQuickIncrementScore(profile.student, checkedEntry!)
                                          }
                                          title={
                                            isEditMode
                                              ? 'Ajouter +1 réussite'
                                              : 'Déverrouillez Saisie pour valider +1'
                                          }
                                          className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-white hover:bg-emerald-600 hover:text-white disabled:opacity-40 text-emerald-800 border border-emerald-300 transition"
                                        >
                                          <Plus className="w-3 h-3" />1
                                        </button>
                                      )}
                                      <span className="text-[11px] font-extrabold px-1.5 py-0.5 rounded bg-white text-emerald-800 border border-emerald-200">
                                        {liveScore}/5
                                      </span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Parcours 2 : Bloquants 0-3 (cocher + choisir l'élève expert) */}
                        {profile.blockingChapters.length > 0 && (
                          <div className="space-y-1.5">
                            <p className="text-[11px] font-bold uppercase tracking-wider text-indigo-800">
                              Besoins (0–3 réussites, hors NE) — cocher pour le TNI ({profile.blockingChapters.length})
                            </p>
                            <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                              {profile.blockingChapters.map(ch => {
                                const itemKey = `tutor_${ch.competence.id}`;
                                const checkedEntry = checkedMap.get(itemKey);
                                const isChecked = Boolean(checkedEntry);
                                const liveScore = checkedEntry?.currentScore ?? ch.score;

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

                                return (
                                  <div
                                    key={itemKey}
                                    className={cn(
                                      'rounded-lg border text-xs transition overflow-hidden',
                                      isChecked
                                        ? 'bg-indigo-50/70 border-indigo-400 ring-1 ring-indigo-200'
                                        : 'bg-slate-50/70 hover:bg-indigo-50/40 border-slate-200'
                                    )}
                                  >
                                    <div className="flex items-center justify-between gap-2 px-2.5 py-1.5">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          toggleCheckedSequence(profile.student.id, {
                                            itemKey,
                                            mode: 'tutor',
                                            competenceId: ch.competence.id,
                                            chapterCode: ch.code,
                                            chapterTitle: ch.title,
                                            domain: ch.domain,
                                            subDomain: ch.subDomain,
                                            currentScore: ch.score,
                                            expertId: experts[0]?.student.id ?? null
                                          })
                                        }
                                        className="flex items-center gap-2 min-w-0 flex-1 text-left"
                                      >
                                        {isChecked ? (
                                          <CheckSquare className="w-4 h-4 text-indigo-700 shrink-0" />
                                        ) : (
                                          <Square className="w-4 h-4 text-slate-400 shrink-0" />
                                        )}
                                        <span className="truncate text-slate-800">
                                          <strong className="font-mono text-indigo-900">{ch.code}</strong> — {ch.title}
                                        </span>
                                      </button>

                                      <div className="flex items-center gap-1.5 shrink-0">
                                        {isChecked && (
                                          <button
                                            type="button"
                                            disabled={!isEditMode}
                                            onClick={() =>
                                              handleQuickIncrementScore(profile.student, checkedEntry!)
                                            }
                                            title={
                                              isEditMode
                                                ? 'Ajouter +1 réussite'
                                                : 'Déverrouillez Saisie pour valider +1'
                                            }
                                            className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-white hover:bg-emerald-600 hover:text-white disabled:opacity-40 text-emerald-800 border border-emerald-300 transition"
                                          >
                                            <Plus className="w-3 h-3" />1
                                          </button>
                                        )}
                                        <span
                                          className={cn(
                                            'text-[10px] font-semibold px-1.5 py-0.5 rounded',
                                            experts.length > 0
                                              ? 'bg-violet-100 text-violet-800'
                                              : 'bg-slate-200 text-slate-600'
                                          )}
                                        >
                                          {experts.length} exp.
                                        </span>
                                        <span className="text-[11px] font-extrabold px-1.5 py-0.5 rounded bg-white text-indigo-800 border border-indigo-200">
                                          {liveScore}/5
                                        </span>
                                      </div>
                                    </div>

                                    {/* Choix de l'élève expert(e) dès que la séquence est cochée */}
                                    {isChecked && checkedEntry && (
                                      <div className="px-2.5 pb-2 pt-1.5 border-t border-indigo-200/70 bg-white/70 space-y-1.5">
                                        <div className="flex items-center justify-between gap-2">
                                          <span className="text-[11px] font-bold text-indigo-900 flex items-center gap-1">
                                            <UserCheck className="w-3.5 h-3.5 text-indigo-600" />
                                            Accompagné(e) par :
                                          </span>
                                          {checkedEntry.expertId && studentById.get(checkedEntry.expertId) && (() => {
                                            const chosenExp = experts.find(e => e.student.id === checkedEntry.expertId);
                                            return (
                                              <div className="flex items-center gap-1.5">
                                                <span className="text-[10px] font-bold text-violet-800 bg-violet-50 border border-violet-200 px-1.5 py-0.5 rounded">
                                                  {studentById.get(checkedEntry.expertId)!.firstName} (
                                                  {studentById.get(checkedEntry.expertId)!.grade})
                                                </span>
                                                {chosenExp && <ExpertBadge score={chosenExp.score} compact />}
                                              </div>
                                            );
                                          })()}
                                        </div>

                                        <div className="flex flex-wrap gap-1.5">
                                          {experts.slice(0, 6).map(cand => {
                                            const isChosen = checkedEntry.expertId === cand.student.id;
                                            const currentLoad = (
                                              expertUsageMap.get(cand.student.id) || []
                                            ).filter(name => name !== profile.student.firstName).length;
                                            return (
                                              <button
                                                type="button"
                                                key={cand.student.id}
                                                onClick={() =>
                                                  updateCheckedItemExpert(
                                                    profile.student.id,
                                                    itemKey,
                                                    isChosen ? null : cand.student.id
                                                  )
                                                }
                                                title={`${cand.student.firstName} ${cand.student.lastName} — ${cand.score}/5 sur ${cand.matchedCode} (${cand.tier === 'expert_over_5' ? 'Expert+ > 5' : 'Expert 5/5'})`}
                                                className={cn(
                                                  'text-[11px] font-semibold px-2 py-0.5 rounded-md border transition flex items-center gap-1',
                                                  isChosen
                                                    ? 'bg-violet-700 text-white border-violet-800 shadow-2xs'
                                                    : 'bg-white hover:bg-violet-50 text-slate-700 border-slate-200'
                                                )}
                                              >
                                                <span>{cand.student.firstName}</span>
                                                {!cand.isSameGrade && (
                                                  <span className="text-[9px] opacity-80">
                                                    ({cand.student.grade})
                                                  </span>
                                                )}
                                                <span
                                                  className={cn(
                                                    'text-[9px] font-bold px-1 rounded tabular-nums',
                                                    cand.tier === 'expert_over_5'
                                                      ? 'bg-emerald-800 text-white'
                                                      : 'bg-emerald-100 text-emerald-800'
                                                  )}
                                                >
                                                  {cand.score}/5
                                                </span>
                                                <span
                                                  className={cn(
                                                    'text-[9px] px-1 rounded',
                                                    isChosen
                                                      ? 'bg-white/20 text-white'
                                                      : currentLoad > 0
                                                        ? 'bg-amber-100 text-amber-800'
                                                        : 'bg-slate-100 text-slate-600'
                                                  )}
                                                >
                                                  {currentLoad > 0 ? `×${currentLoad}` : 'libre'}
                                                </span>
                                              </button>
                                            );
                                          })}
                                          <button
                                            type="button"
                                            onClick={() =>
                                              updateCheckedItemExpert(profile.student.id, itemKey, null)
                                            }
                                            className={cn(
                                              'text-[11px] font-semibold px-2 py-0.5 rounded-md border transition',
                                              checkedEntry.expertId === null
                                                ? 'bg-slate-700 text-white border-slate-800'
                                                : 'bg-white hover:bg-slate-100 text-slate-600 border-slate-200'
                                            )}
                                          >
                                            Enseignante
                                          </button>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Option expert disponible / curriculum pour les élèves ayant tout validé */}
                        {profile.isAllMasteredInFilter && (
                          <div className="pt-1 border-t border-slate-100 space-y-1.5">
                            <button
                              type="button"
                              onClick={() =>
                                toggleCheckedSequence(profile.student.id, {
                                  itemKey: 'expert_helper',
                                  mode: 'expert_helper',
                                  competenceId: null,
                                  chapterCode: 'EXPERT',
                                  chapterTitle: 'Élève expert(e) / Tutorat disponible',
                                  domain: 'Entraide',
                                  subDomain: '',
                                  currentScore: null,
                                  expertId: null
                                })
                              }
                              className={cn(
                                'w-full text-left flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition',
                                checkedMap.has('expert_helper')
                                  ? 'bg-violet-50 border-violet-400 text-violet-900'
                                  : 'bg-slate-50 hover:bg-violet-50/50 border-slate-200 text-slate-700'
                              )}
                            >
                              {checkedMap.has('expert_helper') ? (
                                <CheckSquare className="w-4 h-4 text-violet-700 shrink-0" />
                              ) : (
                                <Square className="w-4 h-4 text-slate-400 shrink-0" />
                              )}
                              <span>Afficher comme élève expert(e) disponible au TNI</span>
                            </button>

                            {profile.curriculumSuggestions.length > 0 && (
                              <div className="space-y-1">
                                <p className="text-[11px] font-bold uppercase tracking-wider text-violet-700 flex items-center gap-1.5">
                                  <Layers className="w-3.5 h-3.5" />
                                  Curriculum d’approfondissement
                                </p>
                                {profile.curriculumSuggestions.slice(0, 2).map(({ item, score }) => {
                                  const itemKey = `curr_${item.code}`;
                                  const isChecked = checkedMap.has(itemKey);
                                  return (
                                    <button
                                      type="button"
                                      key={itemKey}
                                      onClick={() =>
                                        toggleCheckedSequence(profile.student.id, {
                                          itemKey,
                                          mode: 'curriculum',
                                          competenceId: null,
                                          chapterCode: item.code,
                                          chapterTitle: item.title,
                                          domain: item.domain,
                                          subDomain: item.subDomain || '',
                                          currentScore: null,
                                          expertId: null
                                        })
                                      }
                                      className={cn(
                                        'w-full text-left flex items-center justify-between gap-2 text-xs border rounded-md px-2.5 py-1.5 transition',
                                        isChecked
                                          ? 'bg-emerald-50 border-emerald-400 text-emerald-950'
                                          : 'bg-violet-50/70 hover:bg-violet-100/70 border-violet-200 text-slate-800'
                                      )}
                                    >
                                      <span className="flex items-center gap-2 min-w-0">
                                        {isChecked ? (
                                          <CheckSquare className="w-4 h-4 text-emerald-700 shrink-0" />
                                        ) : (
                                          <Square className="w-4 h-4 text-slate-400 shrink-0" />
                                        )}
                                        <span className="truncate">
                                          <strong className="text-violet-800">{item.code}</strong> — {item.title}
                                        </span>
                                      </span>
                                      <span className="text-[11px] font-bold text-violet-700 shrink-0">
                                        {score}/3 pts
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <AutonomieTniModal
        isOpen={isTniOpen}
        onClose={() => setIsTniOpen(false)}
        items={tniItems}
        domainLabel={domainFilter}
        subDomainLabel={subDomainFilter}
      />
    </div>
  );
}
