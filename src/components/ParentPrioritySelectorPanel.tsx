import React, { useState, useMemo, useEffect } from 'react';
import {
  Target,
  CheckSquare,
  Square,
  Save,
  Sparkles,
  CheckCircle2,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { Student, Competence, Result, ParentPriorityEntry } from '../types';
import { cn } from '../utils/helpers';
import { EvaluatedCompetenceInfo } from '../utils/bilanGenerator';
import { buildWeightedSubDomainPriorities } from '../utils/parentPriorities';

interface ParentPrioritySelectorPanelProps {
  currentStudent: Student | undefined;
  activeStudents: Student[];
  competences: Competence[];
  results: Record<string, Record<number, Result>>;
  evaluatedCompMap: Map<number, EvaluatedCompetenceInfo>;
  savedPriorities: ParentPriorityEntry[];
  onSavePriorities: (studentId: string, competenceIds: number[]) => Promise<void>;
}

export default function ParentPrioritySelectorPanel({
  currentStudent,
  activeStudents,
  competences,
  results,
  evaluatedCompMap,
  savedPriorities,
  onSavePriorities
}: ParentPrioritySelectorPanelProps) {
  const savedIdsForStudent = useMemo(() => {
    if (!currentStudent) return [];
    return savedPriorities
      .filter(p => p.student_id === currentStudent.id)
      .map(p => Number(p.competence_id))
      .filter(id => Number.isInteger(id) && id > 0);
  }, [currentStudent, savedPriorities]);

  const [draftIds, setDraftIds] = useState<number[]>(savedIdsForStudent);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<string>('');
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [isPanelOpen, setIsPanelOpen] = useState<boolean>(false);

  useEffect(() => {
    setDraftIds(savedIdsForStudent);
    setFeedback('');
  }, [savedIdsForStudent, currentStudent?.id]);

  const draftSet = useMemo(() => new Set(draftIds), [draftIds]);

  const weightedGroups = useMemo(() => {
    if (!currentStudent) return [];
    return buildWeightedSubDomainPriorities(
      currentStudent,
      activeStudents,
      competences,
      results,
      draftSet,
      evaluatedCompMap
    );
  }, [currentStudent, activeStudents, competences, results, draftSet, evaluatedCompMap]);

  // Ouvrir par défaut les 3 premiers sous-domaines les plus pondérés au changement d'élève
  useEffect(() => {
    if (!currentStudent) return;
    const defaults: Record<string, boolean> = {};
    weightedGroups.slice(0, 3).forEach(g => {
      defaults[g.key] = true;
    });
    setExpandedGroups(defaults);
  }, [currentStudent?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const hasUnsavedChanges = useMemo(() => {
    if (draftIds.length !== savedIdsForStudent.length) return true;
    const savedSet = new Set(savedIdsForStudent);
    return draftIds.some(id => !savedSet.has(id));
  }, [draftIds, savedIdsForStudent]);

  if (!currentStudent) return null;

  const toggleChapter = (compId: number) => {
    setDraftIds(prev =>
      prev.includes(compId) ? prev.filter(id => id !== compId) : [...prev, compId]
    );
  };

  const handlePreselectTop3 = () => {
    const picks: number[] = [];
    // Prendre en priorité dans les sous-domaines en tête (poids fort + besoin)
    for (const group of weightedGroups) {
      for (const ch of group.chapters) {
        if (!ch.isValidated && ch.isEvaluatedForStudent) {
          picks.push(ch.competence.id);
          break; // diversifier sur les 3 sous-domaines les plus lourds d'abord
        }
      }
      if (picks.length >= 3) break;
    }
    if (picks.length < 3) {
      for (const group of weightedGroups) {
        for (const ch of group.chapters) {
          if (!ch.isValidated && ch.isEvaluatedForStudent && !picks.includes(ch.competence.id)) {
            picks.push(ch.competence.id);
            if (picks.length >= 3) break;
          }
        }
        if (picks.length >= 3) break;
      }
    }
    setDraftIds(picks);
  };

  const handleClearAll = () => {
    setDraftIds([]);
  };

  const handleSave = async () => {
    if (!currentStudent) return;
    setIsSaving(true);
    setFeedback('');
    try {
      await onSavePriorities(currentStudent.id, draftIds);
      setFeedback('Enregistré sur le portail parents');
      setTimeout(() => setFeedback(''), 3000);
    } catch {
      setFeedback('Erreur lors de l’enregistrement');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="p-6 bg-slate-50/70 border-b border-slate-200">
      <div
        role="button"
        tabIndex={0}
        aria-expanded={isPanelOpen}
        onClick={() => setIsPanelOpen(prev => !prev)}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setIsPanelOpen(prev => !prev);
          }
        }}
        className={cn(
          'flex flex-col lg:flex-row lg:items-center justify-between gap-3 cursor-pointer select-none group',
          isPanelOpen && 'pb-4 mb-4 border-b border-slate-200'
        )}
      >
        <div>
          <h3 className="font-bold text-slate-800 flex flex-wrap items-center gap-2 text-base group-hover:text-emerald-900 transition-colors">
            <Target className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>Priorités pour le Portail Parents (« Je travaille en priorité... »)</span>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 border border-emerald-200">
              {draftIds.length} coché{draftIds.length > 1 ? 's' : ''}
            </span>
            {hasUnsavedChanges && (
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 border border-amber-200">
                Non enregistré
              </span>
            )}
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Sous-domaines classés par poids relatif dans le niveau ({currentStudent.grade}) et besoins hors NE. Le pourcentage affiché aux parents est calculé par chapitre (objectif 5/5 = 100 %).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0 self-start lg:self-center">
          {feedback && (
            <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-md">
              <CheckCircle2 className="w-3.5 h-3.5" />
              {feedback}
            </span>
          )}
          <span className="p-1 rounded-lg text-slate-400 group-hover:text-slate-700 group-hover:bg-slate-200/60 transition">
            <ChevronDown
              className={cn(
                'w-5 h-5 transition-transform duration-200',
                isPanelOpen && 'rotate-180'
              )}
            />
          </span>
        </div>
      </div>

      {isPanelOpen && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={handlePreselectTop3}
              disabled={weightedGroups.length === 0}
              className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-white hover:bg-emerald-50 disabled:opacity-40 text-emerald-800 border border-emerald-200 transition inline-flex items-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
              Pré-cocher top 3
            </button>
            {draftIds.length > 0 && (
              <button
                type="button"
                onClick={handleClearAll}
                className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 transition"
              >
                Tout décocher
              </button>
            )}
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving || !hasUnsavedChanges}
              className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-emerald-700 hover:bg-emerald-800 disabled:opacity-45 text-white shadow-xs transition inline-flex items-center gap-1.5"
            >
              <Save className="w-3.5 h-3.5" />
              {isSaving ? 'Enregistrement...' : 'Enregistrer pour le portail parent'}
            </button>
          </div>

          {weightedGroups.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-5 text-center text-xs text-slate-500">
              Aucun chapitre à consolider (&lt; 5/5, hors NE) pour {currentStudent.firstName} pour le moment.
            </div>
          ) : (
        <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
          {weightedGroups.map((group, idx) => {
            const isOpen = expandedGroups[group.key] ?? idx < 2;
            const checkedInGroup = group.chapters.filter(c => draftSet.has(c.competence.id)).length;

            return (
              <div
                key={group.key}
                className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs"
              >
                <button
                  type="button"
                  onClick={() =>
                    setExpandedGroups(prev => ({
                      ...prev,
                      [group.key]: !isOpen
                    }))
                  }
                  className="w-full px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 hover:bg-slate-50 transition text-left"
                >
                  <div className="flex flex-wrap items-center gap-2 min-w-0">
                    <span className="text-[11px] font-extrabold bg-slate-800 text-white px-2 py-0.5 rounded">
                      #{idx + 1}
                    </span>
                    <span className="text-[11px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded">
                      {group.domain}
                    </span>
                    <span className="text-xs font-extrabold text-slate-800 truncate">
                      {group.subDomain}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <span
                      className="text-[11px] font-semibold text-slate-600 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded"
                      title="Poids relatif du sous-domaine dans ce niveau"
                    >
                      {group.totalChaptersInLevel} chapitre{group.totalChaptersInLevel > 1 ? 's' : ''} au programme
                    </span>
                    {group.needCount > 0 && (
                      <span className="text-[11px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
                        {group.needCount} à travailler
                      </span>
                    )}
                    {checkedInGroup > 0 && (
                      <span className="text-[11px] font-bold text-emerald-800 bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded">
                        {checkedInGroup} coché{checkedInGroup > 1 ? 's' : ''}
                      </span>
                    )}
                    {isOpen ? (
                      <ChevronUp className="w-4 h-4 text-slate-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-slate-400" />
                    )}
                  </div>
                </button>

                {isOpen && (
                  <div className="px-4 py-2.5 bg-slate-50/70 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-2">
                    {group.chapters.map(ch => {
                      const isChecked = draftSet.has(ch.competence.id);
                      return (
                        <button
                          type="button"
                          key={ch.competence.id}
                          onClick={() => toggleChapter(ch.competence.id)}
                          className={cn(
                            'text-left flex items-center justify-between gap-2.5 px-3 py-2 rounded-lg border text-xs transition',
                            isChecked
                              ? 'bg-emerald-50 border-emerald-400 ring-1 ring-emerald-200 text-emerald-950'
                              : 'bg-white hover:bg-emerald-50/40 border-slate-200 text-slate-800'
                          )}
                        >
                          <span className="flex items-center gap-2 min-w-0">
                            {isChecked ? (
                              <CheckSquare className="w-4 h-4 text-emerald-700 shrink-0" />
                            ) : (
                              <Square className="w-4 h-4 text-slate-400 shrink-0" />
                            )}
                            <span className="truncate">
                              <strong className="font-mono text-emerald-900">{ch.code}</strong> — {ch.title}
                            </span>
                          </span>

                          <span className="flex items-center gap-1.5 shrink-0">
                            {ch.score !== null ? (
                              <>
                                <span className="text-[10px] font-semibold text-slate-500">
                                  {ch.score}/5
                                </span>
                                <span
                                  className={cn(
                                    'text-[11px] font-extrabold px-1.5 py-0.5 rounded border',
                                    ch.pct >= 100
                                      ? 'bg-emerald-700 text-white border-emerald-800'
                                      : ch.pct >= 60
                                        ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                                        : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                  )}
                                >
                                  {ch.pct}%
                                </span>
                              </>
                            ) : (
                              <span className="text-[10px] font-semibold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                                NE
                              </span>
                            )}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
        </div>
      )}
    </div>
  );
}
