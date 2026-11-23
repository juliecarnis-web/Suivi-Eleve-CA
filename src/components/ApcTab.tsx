import React, { useState, useMemo, useEffect } from 'react';
import {
  Users,
  CheckSquare,
  Square,
  Search,
  BookOpen,
  Layers,
  Activity,
  Target,
  Award,
  Sparkles,
  Calendar,
  Save,
  FileText,
  Trash2,
  CheckCircle2,
  Clock
} from 'lucide-react';
import {
  Student,
  Competence,
  Result,
  FluenceScore,
  FluenceReference,
  CurriculumItem,
  CurriculumResult,
  ApcEntry,
  ApcFocusType
} from '../types';
import { cn, getCode, getGrade, getDomain, createDomainSorter } from '../utils/helpers';
import { getEvaluatedCompetenceMap } from '../utils/bilanGenerator';
import { buildApcRecommendations, StudentApcPlan } from '../utils/apcRecommender';
import {
  filterApcEntriesByDateRange,
  groupApcSessions,
  formatDateFr
} from '../utils/apcBilanGenerator';
import ApcBilanModal from './ApcBilanModal';

export interface ApcAssignmentDraft {
  competenceId: number | null;
  chapterCode: string;
  chapterTitle: string;
  domain: string;
  subDomain: string;
  focusType: ApcFocusType;
}

interface ApcTabProps {
  students: Student[];
  activeStudents: Student[];
  competences: Competence[];
  results: Record<string, Record<number, Result>>;
  uniqueGrades: string[];
  fluenceScores?: FluenceScore[];
  fluenceReferences?: FluenceReference[];
  curriculumItems?: CurriculumItem[];
  curriculumResults?: CurriculumResult[];
  apcEntries: ApcEntry[];
  isEditMode: boolean;
  handleToggleEditMode: () => void;
  onSaveApcSession: (payload: {
    sessionDate: string;
    notes: string;
    entries: Array<ApcAssignmentDraft & { studentId: string }>;
  }) => Promise<void>;
  onDeleteApcSession: (sessionId: string) => Promise<void>;
}

function getTodayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function cleanTitle(title: string): string {
  if (!title) return '';
  if (title.includes(' : ')) {
    return title.split(' : ').slice(1).join(' : ').trim();
  }
  return title.trim();
}

function getDefaultAssignmentForPlan(plan: StudentApcPlan): ApcAssignmentDraft {
  const firstNeed = plan.urgentNeeds[0] || plan.consolidateNeeds[0];
  if (firstNeed) {
    return {
      competenceId: firstNeed.competence.id,
      chapterCode: firstNeed.code,
      chapterTitle: firstNeed.title,
      domain: firstNeed.domain,
      subDomain: firstNeed.subDomain,
      focusType: 'competence'
    };
  }
  if (plan.fluenceNeed) {
    return {
      competenceId: null,
      chapterCode: `FLUENCE-P${plan.fluenceNeed.period}`,
      chapterTitle: `Lecture Fluence (objectif ${plan.fluenceNeed.target} MCLM)`,
      domain: 'Lecture / Fluence',
      subDomain: 'Fluence',
      focusType: 'fluence'
    };
  }
  if (plan.curriculumSuggestions[0]) {
    const item = plan.curriculumSuggestions[0].item;
    return {
      competenceId: null,
      chapterCode: item.code,
      chapterTitle: item.title,
      domain: item.domain,
      subDomain: item.subDomain || '',
      focusType: 'curriculum'
    };
  }
  return {
    competenceId: null,
    chapterCode: 'CONSOLIDATION',
    chapterTitle: 'Consolidation / Tutorat',
    domain: 'Transversal',
    subDomain: '',
    focusType: 'custom'
  };
}

export default function ApcTab({
  students,
  activeStudents,
  competences,
  results,
  uniqueGrades,
  fluenceScores = [],
  fluenceReferences = [],
  curriculumItems = [],
  curriculumResults = [],
  apcEntries,
  isEditMode,
  handleToggleEditMode,
  onSaveApcSession,
  onDeleteApcSession
}: ApcTabProps) {
  const [subTab, setSubTab] = useState<'prepare' | 'history'>('prepare');
  const [gradeFilter, setGradeFilter] = useState<string>('all');
  const [domainFilter, setDomainFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<'individual' | 'workshop'>('individual');
  const [workshopGrouping, setWorkshopGrouping] = useState<'theme' | 'competence'>('theme');

  // Brouillon de séance APC à enregistrer dans Neon
  const [sessionDate, setSessionDate] = useState<string>(() => getTodayIso());
  const [sessionNotes, setSessionNotes] = useState<string>('');
  const [draftAssignments, setDraftAssignments] = useState<Record<string, ApcAssignmentDraft>>({});
  const [isSavingSession, setIsSavingSession] = useState<boolean>(false);
  const [saveFeedback, setSaveFeedback] = useState<string>('');

  // Filtres historique & modale bilan date à date
  const [historyStartDate, setHistoryStartDate] = useState<string>('');
  const [historyEndDate, setHistoryEndDate] = useState<string>('');
  const [confirmDeleteSessionId, setConfirmDeleteSessionId] = useState<string | null>(null);
  const [isBilanModalOpen, setIsBilanModalOpen] = useState<boolean>(false);

  const sortDomains = useMemo(() => createDomainSorter(competences), [competences]);

  const uniqueDomains = useMemo(
    () => Array.from(new Set(competences.map(c => getDomain(c)).filter(Boolean))).sort(sortDomains),
    [competences, sortDomains]
  );

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
    const map = new Map<string, { urgent: number; consolidate: number }>();
    activeStudents.forEach(s => {
      let urgent = 0;
      let consolidate = 0;
      competences.forEach(c => {
        if (!evaluatedCompMap.has(c.id)) return;
        const res = results[s.id]?.[c.id];
        if (!res || !res.isStarted || res.score === null || res.score === undefined) return;
        if (res.score < 3) urgent++;
        else if (res.score < 5) consolidate++;
      });
      map.set(s.id, { urgent, consolidate });
    });
    return map;
  }, [activeStudents, competences, results, evaluatedCompMap]);

  const selectedStudents = useMemo(
    () =>
      activeStudents
        .filter(s => selectedIds.has(s.id))
        .sort((a, b) => a.lastName.localeCompare(b.lastName, 'fr') || a.firstName.localeCompare(b.firstName, 'fr')),
    [activeStudents, selectedIds]
  );

  const report = useMemo(
    () =>
      buildApcRecommendations(
        selectedStudents,
        activeStudents,
        competences,
        results,
        fluenceScores,
        fluenceReferences,
        curriculumItems,
        curriculumResults,
        domainFilter,
        evaluatedCompMap
      ),
    [
      selectedStudents,
      activeStudents,
      competences,
      results,
      fluenceScores,
      fluenceReferences,
      curriculumItems,
      curriculumResults,
      domainFilter,
      evaluatedCompMap
    ]
  );

  // Initialiser automatiquement l'affectation par défaut pour chaque nouvel élève coché
  useEffect(() => {
    if (report.studentPlans.length === 0) return;
    setDraftAssignments(prev => {
      let changed = false;
      const next = { ...prev };
      report.studentPlans.forEach(plan => {
        if (!next[plan.student.id]) {
          next[plan.student.id] = getDefaultAssignmentForPlan(plan);
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [report.studentPlans]);

  const setStudentAssignment = (studentId: string, assignment: ApcAssignmentDraft) => {
    setDraftAssignments(prev => ({
      ...prev,
      [studentId]: assignment
    }));
  };

  const applyWorkshopCompetenceToGroup = (comp: Competence, targetStudentIds?: string[]) => {
    const code = getCode(comp);
    const title = cleanTitle(comp.title);
    const domain = getDomain(comp) || 'Sans domaine';
    const subDomain = (comp.subDomain || '').trim();
    const ids = targetStudentIds && targetStudentIds.length > 0
      ? targetStudentIds
      : selectedStudents.filter(s => s.grade === getGrade(comp)).map(s => s.id);

    setDraftAssignments(prev => {
      const next = { ...prev };
      ids.forEach(id => {
        next[id] = {
          competenceId: comp.id,
          chapterCode: code,
          chapterTitle: title,
          domain,
          subDomain,
          focusType: 'competence'
        };
      });
      return next;
    });
    setSaveFeedback(`Atelier « ${code} » affecté aux élèves concernés (prêt à enregistrer).`);
    setTimeout(() => setSaveFeedback(''), 3000);
  };

  const applyWorkshopThemeToSelected = (
    domain: string,
    subDomain: string,
    impactedStudents: Array<{ student: Student; codes: string[] }>
  ) => {
    setDraftAssignments(prev => {
      const next = { ...prev };
      impactedStudents.forEach(item => {
        const primaryCode = item.codes[0];
        const matchingComp = competences.find(
          c => getGrade(c) === item.student.grade && getCode(c) === primaryCode
        );
        next[item.student.id] = {
          competenceId: matchingComp ? matchingComp.id : null,
          chapterCode: matchingComp ? getCode(matchingComp) : subDomain,
          chapterTitle: matchingComp ? cleanTitle(matchingComp.title) : subDomain,
          domain,
          subDomain,
          focusType: matchingComp ? 'competence' : 'theme'
        };
      });
      return next;
    });
    setSaveFeedback(`Thème « ${subDomain} » affecté aux élèves concernés (prêt à enregistrer).`);
    setTimeout(() => setSaveFeedback(''), 3000);
  };

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

  const handleSaveSession = async () => {
    if (selectedStudents.length === 0 || !sessionDate) return;
    setIsSavingSession(true);
    setSaveFeedback('');
    try {
      const entries = report.studentPlans.map(plan => {
        const chosen = draftAssignments[plan.student.id] || getDefaultAssignmentForPlan(plan);
        return {
          studentId: plan.student.id,
          ...chosen
        };
      });

      await onSaveApcSession({
        sessionDate,
        notes: sessionNotes.trim(),
        entries
      });

      setSaveFeedback(`Séance du ${formatDateFr(sessionDate)} enregistrée (${entries.length} élève${entries.length > 1 ? 's' : ''}).`);
      setSessionNotes('');
      setTimeout(() => setSaveFeedback(''), 4000);
    } catch (err) {
      console.error('Erreur sauvegarde séance APC:', err);
      setSaveFeedback('Erreur lors de l’enregistrement de la séance.');
    } finally {
      setIsSavingSession(false);
    }
  };

  const filteredHistoryEntries = useMemo(
    () => filterApcEntriesByDateRange(apcEntries, historyStartDate, historyEndDate),
    [apcEntries, historyStartDate, historyEndDate]
  );

  const historySessions = useMemo(
    () => groupApcSessions(filteredHistoryEntries),
    [filteredHistoryEntries]
  );

  const studentMap = useMemo(() => new Map(students.map(s => [s.id, s])), [students]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Barre supérieure */}
      <div className="bg-white border-b border-slate-200 p-3 flex flex-wrap items-center justify-between gap-3 shrink-0 shadow-sm z-40">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center bg-slate-100 p-1 rounded-lg border border-slate-200">
            <button
              type="button"
              onClick={() => setSubTab('prepare')}
              className={cn(
                'px-3 py-1.5 rounded-md text-xs font-bold transition flex items-center gap-1.5',
                subTab === 'prepare'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              )}
            >
              <Sparkles className="w-3.5 h-3.5" />
              Préparer &amp; Enregistrer
            </button>
            <button
              type="button"
              onClick={() => setSubTab('history')}
              className={cn(
                'px-3 py-1.5 rounded-md text-xs font-bold transition flex items-center gap-1.5',
                subTab === 'history'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              )}
            >
              <Clock className="w-3.5 h-3.5" />
              Historique ({groupApcSessions(apcEntries).length})
            </button>
          </div>

          {subTab === 'prepare' && (
            <>
              <div className="w-px h-6 bg-slate-300 hidden sm:block" />
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
                  onChange={e => setDomainFilter(e.target.value)}
                  className="px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded text-xs font-semibold focus:ring-2 focus:ring-indigo-500 outline-none"
                >
                  <option value="all">Tous</option>
                  {uniqueDomains.map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsBilanModalOpen(true)}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 transition-colors shadow-2xs"
          >
            <FileText className="w-4 h-4 text-indigo-600" />
            Générer bilan APC (date à date)
          </button>
        </div>
      </div>

      {/* CONTENU ONGLET 1 : PRÉPARER & ENREGISTRER */}
      {subTab === 'prepare' && (
        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Colonne Gauche : Élèves volontaires */}
            <div className="lg:col-span-4 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
              <div className="px-4 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-indigo-600" />
                  <h2 className="text-sm font-bold text-slate-800">
                    Élèves volontaires ({selectedStudents.length})
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

              <div className="divide-y divide-slate-100 max-h-[64vh] overflow-y-auto p-1.5">
                {visibleStudents.map(student => {
                  const isChecked = selectedIds.has(student.id);
                  const stats = studentQuickStats.get(student.id) || { urgent: 0, consolidate: 0 };

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
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {stats.urgent + stats.consolidate > 0 ? (
                          <span
                            className="text-[10px] font-semibold text-emerald-800 bg-emerald-100 border border-emerald-200 px-1.5 py-0.5 rounded"
                            title={`${stats.urgent} amorcée(s) < 3, ${stats.consolidate} en cours (3-4)`}
                          >
                            {stats.urgent + stats.consolidate} à consolider
                          </span>
                        ) : (
                          <span className="text-[10px] font-semibold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                            ≥ 5
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

            {/* Colonne Droite : Propositions + Enregistrement en base APC */}
            <div className="lg:col-span-8 space-y-5">
              {selectedStudents.length === 0 ? (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-10 text-center space-y-3">
                  <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto border border-indigo-100">
                    <Sparkles className="w-6 h-6" />
                  </div>
                  <h3 className="text-base font-bold text-slate-800">
                    Cochez les élèves inscrits à la séance d’APC
                  </h3>
                  <p className="text-sm text-slate-500 max-w-lg mx-auto">
                    L’application propose automatiquement les notions les plus utiles à travailler pour chacun et pour le groupe, puis vous permet d’enregistrer la séance en base pour éditer vos bilans de date à date.
                  </p>
                </div>
              ) : (
                <>
                  {/* Barre d'enregistrement de la séance dans la table APC */}
                  <div className="bg-white rounded-xl border border-indigo-200 shadow-sm p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-indigo-600" />
                        <h3 className="text-sm font-bold text-slate-800">
                          Enregistrer cette séance dans la table APC
                        </h3>
                      </div>

                      {!isEditMode && (
                        <button
                          type="button"
                          onClick={handleToggleEditMode}
                          className="text-xs font-bold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-3 py-1 rounded-md transition"
                        >
                          Déverrouiller Saisie pour enregistrer
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                      <div className="md:col-span-3">
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                          Date de la séance
                        </label>
                        <input
                          type="date"
                          value={sessionDate}
                          onChange={e => setSessionDate(e.target.value)}
                          className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none"
                        />
                      </div>

                      <div className="md:col-span-5">
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                          Remarque / Modalité (optionnel)
                        </label>
                        <input
                          type="text"
                          value={sessionNotes}
                          onChange={e => setSessionNotes(e.target.value)}
                          placeholder="Ex. Manipulation, atelier jeu, lecture accompagnée..."
                          className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none"
                        />
                      </div>

                      <div className="md:col-span-4">
                        <button
                          type="button"
                          onClick={handleSaveSession}
                          disabled={!isEditMode || isSavingSession || selectedStudents.length === 0 || !sessionDate}
                          className="w-full py-2 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-lg text-xs font-bold shadow transition flex items-center justify-center gap-2"
                        >
                          <Save className="w-4 h-4" />
                          {isSavingSession
                            ? 'Enregistrement...'
                            : `Enregistrer la séance (${selectedStudents.length})`}
                        </button>
                      </div>
                    </div>

                    {selectedStudents.length > 0 && (
                      <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 flex flex-wrap items-center gap-1.5">
                        <span className="text-[11px] font-bold text-slate-600 mr-1">
                          Objectifs prêts :
                        </span>
                        {report.studentPlans.map(plan => {
                          const chosen = draftAssignments[plan.student.id] || getDefaultAssignmentForPlan(plan);
                          return (
                            <button
                              type="button"
                              key={plan.student.id}
                              onClick={() => setViewMode('individual')}
                              title={`${plan.student.firstName} — ${chosen.chapterCode}${chosen.chapterTitle ? ` : ${chosen.chapterTitle}` : ''} (cliquer pour modifier)`}
                              className="inline-flex items-center gap-1 text-[11px] font-semibold bg-white hover:bg-indigo-50 text-slate-700 border border-slate-200 hover:border-indigo-300 px-2 py-0.5 rounded-md transition"
                            >
                              <span>{plan.student.firstName}</span>
                              <span className="font-mono font-bold text-indigo-700">
                                {chosen.chapterCode}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {saveFeedback && (
                      <div className="text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>{saveFeedback}</span>
                      </div>
                    )}
                  </div>

                  {/* Sélecteur de vue Plan par élève / Atelier commun */}
                  <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center bg-slate-100 p-1 rounded-lg border border-slate-200">
                      <button
                        type="button"
                        onClick={() => setViewMode('individual')}
                        className={cn(
                          'px-3.5 py-1.5 rounded-md text-xs font-bold transition flex items-center gap-1.5',
                          viewMode === 'individual'
                            ? 'bg-indigo-600 text-white shadow-sm'
                            : 'text-slate-600 hover:text-slate-900'
                        )}
                      >
                        <Target className="w-3.5 h-3.5" />
                        Plan par élève ({report.studentPlans.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setViewMode('workshop')}
                        className={cn(
                          'px-3.5 py-1.5 rounded-md text-xs font-bold transition flex items-center gap-1.5',
                          viewMode === 'workshop'
                            ? 'bg-indigo-600 text-white shadow-sm'
                            : 'text-slate-600 hover:text-slate-900'
                        )}
                      >
                        <BookOpen className="w-3.5 h-3.5" />
                        Atelier commun ({workshopGrouping === 'theme' ? report.workshopByTheme.length : report.workshopByCompetence.length})
                      </button>
                    </div>

                    {viewMode === 'workshop' && (
                      <div className="flex items-center bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs">
                        <button
                          type="button"
                          onClick={() => setWorkshopGrouping('theme')}
                          className={cn(
                            'px-2.5 py-1 rounded-md font-semibold transition',
                            workshopGrouping === 'theme'
                              ? 'bg-white text-indigo-700 shadow-sm'
                              : 'text-slate-600 hover:text-slate-900'
                          )}
                        >
                          Thèmes multi-niveaux
                        </button>
                        <button
                          type="button"
                          onClick={() => setWorkshopGrouping('competence')}
                          className={cn(
                            'px-2.5 py-1 rounded-md font-semibold transition',
                            workshopGrouping === 'competence'
                              ? 'bg-white text-indigo-700 shadow-sm'
                              : 'text-slate-600 hover:text-slate-900'
                          )}
                        >
                          Séquences précises
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Encart Fluence */}
                  {report.fluenceWorkshopStudents.length > 0 && (
                    <div className="bg-indigo-50/70 border border-indigo-200 rounded-xl p-4 space-y-2">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-800 flex items-center gap-2">
                        <Activity className="w-4 h-4 text-indigo-600" />
                        Piste Lecture / Fluence ({report.fluenceWorkshopStudents.length} volontaire{report.fluenceWorkshopStudents.length > 1 ? 's' : ''} sous l’objectif)
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        {report.fluenceWorkshopStudents.map(({ student, need }) => {
                          const isFluenceAssigned = draftAssignments[student.id]?.focusType === 'fluence';
                          return (
                            <button
                              type="button"
                              key={student.id}
                              onClick={() =>
                                setStudentAssignment(student.id, {
                                  competenceId: null,
                                  chapterCode: `FLUENCE-P${need.period}`,
                                  chapterTitle: `Lecture Fluence (objectif ${need.target} MCLM)`,
                                  domain: 'Lecture / Fluence',
                                  subDomain: 'Fluence',
                                  focusType: 'fluence'
                                })
                              }
                              title="Cliquer pour retenir Fluence pour cet élève"
                              className={cn(
                                'rounded-lg px-3 py-1.5 text-xs flex items-center gap-2 shadow-2xs transition border',
                                isFluenceAssigned
                                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-700'
                                  : 'bg-white hover:bg-indigo-100 border-indigo-200 text-slate-800'
                              )}
                            >
                              {isFluenceAssigned && <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />}
                              <span className="font-bold">{student.firstName}</span>
                              <span className={cn('text-[11px] font-semibold', isFluenceAssigned ? 'text-emerald-100' : 'text-slate-500')}>
                                ({student.grade})
                              </span>
                              <span className={cn('font-bold', isFluenceAssigned ? 'text-white' : 'text-indigo-700')}>
                                {need.score} / {need.target} MCLM
                              </span>
                              <span className={cn('text-[10px]', isFluenceAssigned ? 'text-emerald-100' : 'text-slate-400')}>
                                P{need.period}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* VUE 1 : PLAN PAR ÉLÈVE (avec sélection du chapitre retenu) */}
                  {viewMode === 'individual' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {report.studentPlans.map(plan => {
                        const chosen = draftAssignments[plan.student.id] || getDefaultAssignmentForPlan(plan);
                        const topPriorities = [
                          ...plan.urgentNeeds.slice(0, 3),
                          ...plan.consolidateNeeds.slice(0, Math.max(0, 4 - Math.min(3, plan.urgentNeeds.length)))
                        ].slice(0, 4);
                        const gradeCompetences = competences.filter(c => getGrade(c) === plan.student.grade);

                        return (
                          <div
                            key={plan.student.id}
                            className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-col gap-3"
                          >
                            <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100">
                              <div>
                                <h3 className="text-sm font-extrabold text-slate-800">
                                  {plan.student.firstName}{' '}
                                  <span className="uppercase">{plan.student.lastName}</span>
                                </h3>
                                <p className="text-[11px] text-slate-500">
                                  {plan.student.grade} •{' '}
                                  {plan.evaluatedCount > 0
                                    ? `${plan.masteredCount}/${plan.evaluatedCount} séquences validées (≥ 5)`
                                    : 'Aucune séquence évaluée'}
                                </p>
                              </div>

                              {plan.isAllMastered && (
                                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-800 bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded-md">
                                  <Award className="w-3.5 h-3.5 text-emerald-700" />
                                  Tout validé
                                </span>
                              )}
                            </div>

                            {/* Chapitre retenu pour l'enregistrement */}
                            <div className="bg-indigo-50/70 border border-indigo-200 rounded-lg p-2.5 space-y-1.5">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-800">
                                  Chapitre retenu pour la séance :
                                </span>
                                <span className="text-[11px] font-extrabold text-indigo-700 bg-white px-2 py-0.5 rounded border border-indigo-200">
                                  {chosen.chapterCode}
                                </span>
                              </div>
                              <select
                                value={chosen.competenceId !== null ? String(chosen.competenceId) : `__special__${chosen.chapterCode}`}
                                onChange={e => {
                                  const val = e.target.value;
                                  if (val === '__fluence__') {
                                    setStudentAssignment(plan.student.id, {
                                      competenceId: null,
                                      chapterCode: `FLUENCE-P${plan.fluenceNeed?.period || 1}`,
                                      chapterTitle: 'Lecture Fluence',
                                      domain: 'Lecture / Fluence',
                                      subDomain: 'Fluence',
                                      focusType: 'fluence'
                                    });
                                    return;
                                  }
                                  if (val === '__custom__') {
                                    setStudentAssignment(plan.student.id, {
                                      competenceId: null,
                                      chapterCode: 'CONSOLIDATION',
                                      chapterTitle: 'Consolidation / Tutorat',
                                      domain: 'Transversal',
                                      subDomain: '',
                                      focusType: 'custom'
                                    });
                                    return;
                                  }
                                  const compId = Number(val);
                                  const comp = gradeCompetences.find(c => c.id === compId);
                                  if (comp) {
                                    setStudentAssignment(plan.student.id, {
                                      competenceId: comp.id,
                                      chapterCode: getCode(comp),
                                      chapterTitle: cleanTitle(comp.title),
                                      domain: getDomain(comp) || 'Sans domaine',
                                      subDomain: (comp.subDomain || '').trim(),
                                      focusType: 'competence'
                                    });
                                  }
                                }}
                                className="w-full px-2.5 py-1 bg-white border border-indigo-200 rounded text-xs font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500"
                              >
                                {chosen.competenceId === null && (
                                  <option value={`__special__${chosen.chapterCode}`}>
                                    {chosen.chapterCode} — {chosen.chapterTitle}
                                  </option>
                                )}
                                <option value="__fluence__">Lecture Fluence</option>
                                <option value="__custom__">Consolidation / Tutorat libre</option>
                                {gradeCompetences.map(c => (
                                  <option key={c.id} value={String(c.id)}>
                                    {getCode(c)} — {cleanTitle(c.title)}
                                  </option>
                                ))}
                              </select>
                            </div>

                            {/* Suggestions cliquables */}
                            {topPriorities.length > 0 ? (
                              <div className="space-y-1.5">
                                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                                  Suggestions prioritaires (cliquer pour retenir)
                                </p>
                                {topPriorities.map(need => {
                                  const isSelectedChapter = chosen.competenceId === need.competence.id;
                                  return (
                                    <button
                                      type="button"
                                      key={need.competence.id}
                                      onClick={() =>
                                        setStudentAssignment(plan.student.id, {
                                          competenceId: need.competence.id,
                                          chapterCode: need.code,
                                          chapterTitle: need.title,
                                          domain: need.domain,
                                          subDomain: need.subDomain,
                                          focusType: 'competence'
                                        })
                                      }
                                      className={cn(
                                        'w-full text-left p-2.5 rounded-lg border flex items-start justify-between gap-2.5 transition',
                                        isSelectedChapter
                                          ? 'border-indigo-500 bg-indigo-50/40 ring-1 ring-indigo-500'
                                          : 'border-slate-200 bg-slate-50/70 hover:bg-slate-100/70'
                                      )}
                                    >
                                      <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-1.5">
                                          <span className="text-xs font-extrabold text-slate-800">
                                            {need.code}
                                          </span>
                                          <span className="text-[10px] font-semibold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded">
                                            {need.domain}
                                          </span>
                                          <span
                                            className={cn(
                                              'text-[10px] font-bold px-1.5 py-0.5 rounded border',
                                              need.priority === 'urgent'
                                                ? 'text-emerald-900 bg-emerald-100 border-emerald-200'
                                                : 'text-emerald-900 bg-emerald-200/80 border-emerald-300'
                                            )}
                                          >
                                            {need.priority === 'urgent' ? 'À amorcer' : 'Palier 5 proche'}
                                          </span>
                                        </div>
                                        <p className="text-xs text-slate-600 mt-1 leading-snug">
                                          {need.title}
                                        </p>
                                      </div>

                                      <div className="text-right shrink-0">
                                        <span className="inline-block text-xs font-extrabold px-2 py-0.5 rounded border bg-white text-emerald-900 border-emerald-200">
                                          {need.score} / 5
                                        </span>
                                        <p className="text-[10px] text-slate-400 mt-0.5">
                                          Cl. {need.cohortAvg.toFixed(1)}
                                        </p>
                                      </div>
                                    </button>
                                  );
                                })}
                              </div>
                            ) : (
                              <div className="p-2.5 rounded-lg bg-emerald-50/70 border border-emerald-200 text-xs text-emerald-900">
                                {plan.evaluatedCount > 0
                                  ? 'Toutes les notions évaluées sont déjà validées (≥ 5).'
                                  : 'Aucune notion évaluée sous le seuil pour ce filtre.'}
                              </div>
                            )}

                            {plan.curriculumSuggestions.length > 0 && plan.isAllMastered && (
                              <div className="pt-2 border-t border-slate-100 space-y-1">
                                <p className="text-[11px] font-bold uppercase tracking-wider text-violet-700 flex items-center gap-1.5">
                                  <Layers className="w-3.5 h-3.5" />
                                  Curriculum à approfondir
                                </p>
                                {plan.curriculumSuggestions.slice(0, 2).map(({ item, score }) => (
                                  <button
                                    type="button"
                                    key={item.id}
                                    onClick={() =>
                                      setStudentAssignment(plan.student.id, {
                                        competenceId: null,
                                        chapterCode: item.code,
                                        chapterTitle: item.title,
                                        domain: item.domain,
                                        subDomain: item.subDomain || '',
                                        focusType: 'curriculum'
                                      })
                                    }
                                    className="w-full text-left flex items-center justify-between gap-2 text-xs bg-violet-50/50 hover:bg-violet-100/60 border border-violet-100 rounded-md px-2.5 py-1.5 transition"
                                  >
                                    <span className="text-slate-700 truncate">
                                      <strong className="text-violet-800">{item.code}</strong> — {item.title}
                                    </span>
                                    <span className="text-[11px] font-bold text-violet-700 shrink-0">
                                      {score}/3 pts
                                    </span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* VUE 2A : ATELIER COMMUN PAR THÈME MULTI-NIVEAUX */}
                  {viewMode === 'workshop' && workshopGrouping === 'theme' && (
                    <div className="space-y-3">
                      {report.workshopByTheme.length === 0 ? (
                        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-sm text-slate-500">
                          Aucune notion commune sous le seuil de 5 pour les élèves sélectionnés.
                        </div>
                      ) : (
                        report.workshopByTheme.map((theme, idx) => {
                          const assignedCount = theme.impactedStudents.filter(item => {
                            const plan = report.studentPlans.find(p => p.student.id === item.student.id);
                            const chosen = draftAssignments[item.student.id] || (plan ? getDefaultAssignmentForPlan(plan) : null);
                            if (!chosen) return false;
                            return (
                              (chosen.domain === theme.domain && chosen.subDomain === theme.subDomain) ||
                              item.codes.includes(chosen.chapterCode)
                            );
                          }).length;
                          const allAssigned = theme.impactedStudents.length > 0 && assignedCount === theme.impactedStudents.length;

                          return (
                            <div
                              key={theme.key}
                              className={cn(
                                'bg-white rounded-xl border shadow-sm p-4 space-y-3 transition',
                                allAssigned ? 'border-emerald-300 ring-1 ring-emerald-200' : 'border-slate-200'
                              )}
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-xs font-extrabold bg-indigo-600 text-white px-2 py-0.5 rounded">
                                    #{idx + 1}
                                  </span>
                                  <span className="text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded">
                                    {theme.domain}
                                  </span>
                                  <h3 className="text-sm font-bold text-slate-800">
                                    {theme.subDomain}
                                  </h3>
                                </div>

                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-xs font-bold text-slate-700 bg-slate-100 px-2.5 py-1 rounded-md border border-slate-200">
                                    {theme.totalImpacted} / {selectedStudents.length} concerné(s)
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      applyWorkshopThemeToSelected(
                                        theme.domain,
                                        theme.subDomain,
                                        theme.impactedStudents
                                      )
                                    }
                                    className={cn(
                                      'text-xs font-bold px-2.5 py-1 rounded-md border transition inline-flex items-center gap-1.5',
                                      allAssigned
                                        ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-700'
                                        : assignedCount > 0
                                          ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-300'
                                          : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border-indigo-200'
                                    )}
                                  >
                                    {allAssigned && <CheckCircle2 className="w-3.5 h-3.5" />}
                                    {allAssigned
                                      ? `Retenu (${assignedCount} él.)`
                                      : assignedCount > 0
                                        ? `Retenir pour tous (${assignedCount}/${theme.impactedStudents.length})`
                                        : 'Retenir pour la séance'}
                                  </button>
                                  {assignedCount > 0 && (
                                    <button
                                      type="button"
                                      onClick={() => setViewMode('individual')}
                                      className="text-xs font-semibold text-indigo-700 hover:text-indigo-900 bg-white hover:bg-indigo-50 border border-indigo-200 px-2 py-1 rounded-md transition"
                                    >
                                      Voir le plan
                                    </button>
                                  )}
                                </div>
                              </div>

                              <div className="flex flex-wrap gap-2">
                                {theme.impactedStudents.map(item => (
                                  <div
                                    key={item.student.id}
                                    className={cn(
                                      'px-2.5 py-1.5 rounded-lg border text-xs flex items-center gap-2',
                                      item.priority === 'urgent'
                                        ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                                        : 'bg-emerald-100/70 border-emerald-300 text-emerald-950'
                                    )}
                                  >
                                    <span className="font-bold">{item.student.firstName}</span>
                                    <span className="text-[10px] font-semibold text-slate-500">
                                      ({item.student.grade})
                                    </span>
                                    <span className="text-[11px] font-mono font-bold text-indigo-700">
                                      {item.codes.slice(0, 3).join(', ')}
                                    </span>
                                    <span className="text-[11px] font-extrabold bg-white px-1.5 py-0.5 rounded border border-emerald-200">
                                      min {item.lowestScore}/5
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}

                  {/* VUE 2B : ATELIER COMMUN PAR SÉQUENCE PRÉCISE */}
                  {viewMode === 'workshop' && workshopGrouping === 'competence' && (
                    <div className="space-y-3">
                      {report.workshopByCompetence.length === 0 ? (
                        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-sm text-slate-500">
                          Aucune séquence évaluée sous le seuil de 5 pour les élèves sélectionnés.
                        </div>
                      ) : (
                        report.workshopByCompetence.slice(0, 15).map((item, idx) => {
                          const targetGradeStudents = selectedStudents.filter(s => s.grade === item.grade);
                          const assignedCount = targetGradeStudents.filter(s => {
                            const plan = report.studentPlans.find(p => p.student.id === s.id);
                            const chosen = draftAssignments[s.id] || (plan ? getDefaultAssignmentForPlan(plan) : null);
                            return chosen?.competenceId === item.competence.id || chosen?.chapterCode === item.code;
                          }).length;
                          const allAssigned = targetGradeStudents.length > 0 && assignedCount === targetGradeStudents.length;

                          return (
                            <div
                              key={item.competence.id}
                              className={cn(
                                'bg-white rounded-xl border shadow-sm p-4 space-y-3 transition',
                                allAssigned ? 'border-emerald-300 ring-1 ring-emerald-200' : 'border-slate-200'
                              )}
                            >
                              <div className="flex flex-wrap items-start justify-between gap-2">
                                <div>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-xs font-extrabold bg-indigo-600 text-white px-2 py-0.5 rounded">
                                      #{idx + 1}
                                    </span>
                                    <span className="text-xs font-extrabold text-slate-800 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded">
                                      {item.grade} — {item.code}
                                    </span>
                                    <span className="text-xs font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">
                                      {item.domain}
                                    </span>
                                  </div>
                                  <p className="text-sm font-semibold text-slate-800 mt-1.5">
                                    {item.cleanTitle}
                                  </p>
                                </div>

                                <div className="flex flex-wrap items-center gap-2 shrink-0">
                                  <span className="text-xs font-bold text-slate-700 bg-slate-100 px-2.5 py-1 rounded border border-slate-200">
                                    {item.needCount} à accompagner • moy. {item.cohortAvg.toFixed(1)}/5
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => applyWorkshopCompetenceToGroup(item.competence)}
                                    className={cn(
                                      'text-xs font-bold px-2.5 py-1 rounded-md border transition inline-flex items-center gap-1.5',
                                      allAssigned
                                        ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-700'
                                        : assignedCount > 0
                                          ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-300'
                                          : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border-indigo-200'
                                    )}
                                  >
                                    {allAssigned && <CheckCircle2 className="w-3.5 h-3.5" />}
                                    {allAssigned
                                      ? `Retenu (${assignedCount} él.)`
                                      : assignedCount > 0
                                        ? `Retenir (${assignedCount}/${targetGradeStudents.length})`
                                        : 'Retenir pour la séance'}
                                  </button>
                                  {assignedCount > 0 && (
                                    <button
                                      type="button"
                                      onClick={() => setViewMode('individual')}
                                      className="text-xs font-semibold text-indigo-700 hover:text-indigo-900 bg-white hover:bg-indigo-50 border border-indigo-200 px-2 py-1 rounded-md transition"
                                    >
                                      Voir le plan
                                    </button>
                                  )}
                                </div>
                              </div>

                              <div className="flex flex-wrap gap-2 text-xs">
                                {item.urgentStudents.map(({ student, score }) => (
                                  <span
                                    key={student.id}
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-950 font-semibold"
                                  >
                                    <span>{student.firstName}</span>
                                    <span className="text-[11px] font-bold bg-white px-1.5 py-0.5 rounded border border-emerald-200">
                                      {score}/5 (amorcer)
                                    </span>
                                  </span>
                                ))}
                                {item.consolidateStudents.map(({ student, score }) => (
                                  <span
                                    key={student.id}
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-100/80 border border-emerald-300 text-emerald-950 font-semibold"
                                  >
                                    <span>{student.firstName}</span>
                                    <span className="text-[11px] font-bold bg-white px-1.5 py-0.5 rounded border border-emerald-300">
                                      {score}/5 (palier)
                                    </span>
                                  </span>
                                ))}
                                {item.masteredStudents.map(({ student, score }) => (
                                  <span
                                    key={student.id}
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-800 text-white font-semibold"
                                  >
                                    <span>{student.firstName}</span>
                                    <span className="text-[11px] font-bold opacity-90">
                                      {score}/5 (tuteur)
                                    </span>
                                  </span>
                                ))}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* CONTENU ONGLET 2 : HISTORIQUE DES SÉANCES APC */}
      {subTab === 'history' && (
        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-5xl mx-auto space-y-5">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-wrap items-end justify-between gap-4">
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">Du</label>
                  <input
                    type="date"
                    value={historyStartDate}
                    onChange={e => setHistoryStartDate(e.target.value)}
                    className="px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-semibold outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">Au</label>
                  <input
                    type="date"
                    value={historyEndDate}
                    onChange={e => setHistoryEndDate(e.target.value)}
                    className="px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-semibold outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                {(historyStartDate || historyEndDate) && (
                  <button
                    type="button"
                    onClick={() => {
                      setHistoryStartDate('');
                      setHistoryEndDate('');
                    }}
                    className="px-2.5 py-1.5 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition"
                  >
                    Effacer dates
                  </button>
                )}
              </div>

              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold text-slate-500">
                  {historySessions.length} séance{historySessions.length > 1 ? 's' : ''} •{' '}
                  {new Set(filteredHistoryEntries.map(e => e.student_id)).size} élève(s)
                </span>
                <button
                  type="button"
                  onClick={() => setIsBilanModalOpen(true)}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold shadow-sm transition"
                >
                  <FileText className="w-3.5 h-3.5" />
                  Générer bilan (date à date)
                </button>
              </div>
            </div>

            {historySessions.length === 0 ? (
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-10 text-center space-y-2">
                <Calendar className="w-8 h-8 text-slate-300 mx-auto" />
                <p className="text-sm font-semibold text-slate-600">
                  Aucune séance APC enregistrée sur cette période.
                </p>
                <p className="text-xs text-slate-400">
                  Cochez des élèves volontaires dans l’onglet « Préparer &amp; Enregistrer » puis enregistrez votre première séance.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {historySessions.map(session => {
                  const isConfirmingDelete = confirmDeleteSessionId === session.sessionId;
                  return (
                    <div
                      key={session.sessionId}
                      className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
                        <div className="flex flex-wrap items-center gap-2.5">
                          <span className="inline-flex items-center gap-1.5 text-xs font-extrabold text-indigo-800 bg-indigo-50 border border-indigo-200 px-2.5 py-1 rounded-md">
                            <Calendar className="w-3.5 h-3.5" />
                            {formatDateFr(session.sessionDate)}
                          </span>
                          <span className="text-xs font-bold text-slate-700">
                            {session.studentCount} élève{session.studentCount > 1 ? 's' : ''}
                          </span>
                          {session.notes && (
                            <span className="text-xs text-slate-500 italic">
                              — {session.notes}
                            </span>
                          )}
                        </div>

                        {isEditMode && (
                          <div className="flex items-center gap-1.5">
                            {isConfirmingDelete ? (
                              <>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    await onDeleteApcSession(session.sessionId);
                                    setConfirmDeleteSessionId(null);
                                  }}
                                  className="px-2.5 py-1 text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white rounded transition"
                                >
                                  Confirmer suppression
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteSessionId(null)}
                                  className="px-2 py-1 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded transition"
                                >
                                  Annuler
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteSessionId(session.sessionId)}
                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition"
                                title="Supprimer cette séance APC"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {session.entries.map(entry => {
                          const st = studentMap.get(entry.student_id);
                          const liveRes =
                            entry.competence_id !== null
                              ? results[entry.student_id]?.[entry.competence_id]
                              : undefined;
                          const liveScore =
                            liveRes && liveRes.isStarted && liveRes.score !== null && liveRes.score !== undefined
                              ? Number(liveRes.score)
                              : null;

                          return (
                            <div
                              key={entry.id}
                              className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs"
                            >
                              <div className="min-w-0">
                                <p className="font-bold text-slate-800 truncate">
                                  {st ? `${st.firstName} ${st.lastName}` : entry.student_id}{' '}
                                  {st && (
                                    <span className="text-[10px] font-semibold text-slate-500">
                                      ({st.grade})
                                    </span>
                                  )}
                                </p>
                                <p className="text-[11px] text-slate-600 truncate">
                                  <strong className="text-indigo-700">{entry.chapter_code}</strong>
                                  {entry.chapter_title && entry.chapter_title !== entry.chapter_code
                                    ? ` — ${entry.chapter_title}`
                                    : ''}
                                </p>
                              </div>

                              {liveScore !== null && (
                                <span
                                  className={cn(
                                    'text-[11px] font-extrabold px-2 py-0.5 rounded border shrink-0',
                                    liveScore >= 5
                                      ? 'bg-emerald-800 text-white border-emerald-900'
                                      : liveScore >= 3
                                        ? 'bg-emerald-200 text-emerald-950 border-emerald-300'
                                        : 'bg-emerald-50 text-emerald-900 border-emerald-200'
                                  )}
                                  title="Score actuel sur cette compétence"
                                >
                                  {liveScore}/5{liveScore >= 5 ? ' ✓' : ''}
                                </span>
                              )}
                            </div>
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
      )}

      <ApcBilanModal
        isOpen={isBilanModalOpen}
        onClose={() => setIsBilanModalOpen(false)}
        apcEntries={apcEntries}
        students={students}
        competences={competences}
        results={results}
        uniqueGrades={uniqueGrades}
        initialStartDate={historyStartDate || undefined}
        initialEndDate={historyEndDate || undefined}
      />
    </div>
  );
}
