import React, { useState, useMemo, useEffect } from 'react';
import {
  X,
  Monitor,
  Copy,
  Check,
  UserCheck,
  ListChecks,
  ListOrdered,
  Type
} from 'lucide-react';
import { Student } from '../types';
import { cn } from '../utils/helpers';
import { AutonomieAssignment } from '../utils/autonomieRecommender';

export interface TniPlanItem {
  itemKey: string;
  student: Student;
  assignment: AutonomieAssignment;
  expert: Student | null;
}

export type TniSourceMode = 'checked' | 'priority';

interface StudentTniCardData {
  student: Student;
  tasks: Array<{
    itemKey: string;
    assignment: AutonomieAssignment;
    expert: Student | null;
  }>;
  hasExpertHelper: boolean;
}

interface AutonomieTniModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: TniPlanItem[];
  priorityItems?: TniPlanItem[];
  domainLabel: string;
  subDomainLabel: string;
}

function getModeOrder(mode: AutonomieAssignment['mode']): number {
  if (mode === 'solo') return 0;
  if (mode === 'tutor') return 1;
  if (mode === 'curriculum') return 2;
  return 3;
}

function groupItemsIntoStudentCards(rawItems: TniPlanItem[]): StudentTniCardData[] {
  const map = new Map<string, StudentTniCardData>();

  rawItems.forEach(({ itemKey, student, assignment, expert }) => {
    let entry = map.get(student.id);
    if (!entry) {
      entry = {
        student,
        tasks: [],
        hasExpertHelper: false
      };
      map.set(student.id, entry);
    }

    if (assignment.mode === 'expert_helper') {
      entry.hasExpertHelper = true;
    } else {
      entry.tasks.push({ itemKey, assignment, expert });
    }
  });

  const cards = Array.from(map.values());

  // Tri des chapitres à l'intérieur de chaque carte selon l'ordre de priorité pédagogique :
  // 1. Autonomie seule (du score le plus proche de la validation 4/5 vers 3/5)
  // 2. Déblocage en binôme (du plus bloquant 0/5 vers 3/5)
  // 3. Approfondissement curriculum
  cards.forEach(card => {
    card.tasks.sort((a, b) => {
      const orderDiff = getModeOrder(a.assignment.mode) - getModeOrder(b.assignment.mode);
      if (orderDiff !== 0) return orderDiff;

      const scoreA = a.assignment.currentScore ?? 0;
      const scoreB = b.assignment.currentScore ?? 0;
      if (a.assignment.mode === 'solo' && scoreB !== scoreA) {
        return scoreB - scoreA;
      }
      if (a.assignment.mode === 'tutor' && scoreA !== scoreB) {
        return scoreA - scoreB;
      }
      return a.assignment.chapterCode.localeCompare(b.assignment.chapterCode, 'fr', {
        numeric: true
      });
    });
  });

  return cards;
}

export default function AutonomieTniModal({
  isOpen,
  onClose,
  items,
  priorityItems = [],
  domainLabel,
  subDomainLabel
}: AutonomieTniModalProps) {
  const [sourceMode, setSourceMode] = useState<TniSourceMode>(
    items.length > 0 ? 'checked' : 'priority'
  );
  const [maxTasks, setMaxTasks] = useState<3 | 5 | 0>(3); // 0 = tous
  const [largeText, setLargeText] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      setSourceMode(items.length > 0 ? 'checked' : 'priority');
      setCopied(false);
    }
  }, [isOpen, items.length]);

  const checkedCards = useMemo(() => groupItemsIntoStudentCards(items), [items]);
  const priorityCards = useMemo(
    () => groupItemsIntoStudentCards(priorityItems),
    [priorityItems]
  );

  const activeCards = sourceMode === 'checked' ? checkedCards : priorityCards;

  if (!isOpen) return null;

  const todayStr = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  });

  const subtitleParts: string[] = [todayStr];
  if (domainLabel !== 'all') {
    subtitleParts.push(domainLabel);
  }
  if (subDomainLabel !== 'all') {
    subtitleParts.push(subDomainLabel);
  }
  subtitleParts.push(`${activeCards.length} élève${activeCards.length > 1 ? 's' : ''}`);

  const handleCopy = () => {
    const header = [
      `Autonomie — Plan de travail (${todayStr})`,
      domainLabel !== 'all'
        ? `Filtre : ${domainLabel}${subDomainLabel !== 'all' ? ` · ${subDomainLabel}` : ''}`
        : '',
      sourceMode === 'checked'
        ? 'Affichage : Séquences cochées en saisie'
        : 'Affichage : Chapitres par ordre de priorité',
      ''
    ]
      .filter((l, idx) => idx === 0 || l !== '' || idx === 3)
      .join('\n');

    const lines = activeCards.map(card => {
      const visibleTasks =
        sourceMode === 'priority' && maxTasks > 0
          ? card.tasks.slice(0, maxTasks)
          : card.tasks;

      if (visibleTasks.length === 0 && card.hasExpertHelper) {
        return `${card.student.firstName} : Expert(e) disponible pour aider`;
      }

      const taskDesc = visibleTasks
        .map((t, i) => {
          const titlePart =
            t.assignment.chapterTitle && t.assignment.chapterTitle !== t.assignment.chapterCode
              ? ` (${t.assignment.chapterTitle})`
              : '';
          const modePart =
            t.assignment.mode === 'tutor'
              ? t.expert
                ? ` [avec ${t.expert.firstName}]`
                : ` [avec l’enseignante]`
              : '';
          return `${i + 1}. ${t.assignment.chapterCode}${titlePart}${modePart}`;
        })
        .join(' ; ');

      return `${card.student.firstName} : ${taskDesc}`;
    });

    navigator.clipboard?.writeText(`${header}\n${lines.join('\n')}`.trim());
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="fixed inset-0 bg-slate-900 z-[100] flex flex-col overflow-hidden">
      {/* Barre supérieure sombre alignée sur le style TNI Fluence / Pilotage / APC */}
      <div className="bg-slate-800 border-b border-slate-700 px-6 py-4 flex flex-wrap items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow">
            <Monitor className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">
              Autonomie — Plan de travail
            </h2>
            <p className="text-xs text-slate-300 capitalize">
              {subtitleParts.join(' • ')}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Choix de la source : séquences cochées ou ordre de priorité */}
          <div className="flex items-center bg-slate-700 p-1 rounded-lg border border-slate-600">
            <button
              type="button"
              onClick={() => setSourceMode('checked')}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition whitespace-nowrap shrink-0',
                sourceMode === 'checked'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-200 hover:text-white'
              )}
            >
              <ListChecks className="w-3.5 h-3.5" />
              Cochés en saisie ({checkedCards.length})
            </button>
            <button
              type="button"
              onClick={() => setSourceMode('priority')}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition whitespace-nowrap shrink-0',
                sourceMode === 'priority'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-200 hover:text-white'
              )}
            >
              <ListOrdered className="w-3.5 h-3.5" />
              Par priorité ({priorityCards.length})
            </button>
          </div>

          {/* Limite de chapitres en mode priorité */}
          {sourceMode === 'priority' && (
            <div className="flex items-center bg-slate-700 p-1 rounded-lg border border-slate-600">
              {([
                { value: 3, label: 'Top 3' },
                { value: 5, label: 'Top 5' },
                { value: 0, label: 'Tous' }
              ] as const).map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setMaxTasks(opt.value)}
                  className={cn(
                    'px-2.5 py-1.5 rounded-md text-xs font-semibold transition whitespace-nowrap shrink-0',
                    maxTasks === opt.value
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'text-slate-200 hover:text-white'
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={() => setLargeText(v => !v)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border transition whitespace-nowrap shrink-0',
              largeText
                ? 'bg-indigo-600 text-white border-indigo-500'
                : 'bg-slate-700 text-slate-200 border-slate-600 hover:bg-slate-600'
            )}
          >
            <Type className="w-3.5 h-3.5" />
            {largeText ? 'Texte standard' : 'Grand texte'}
          </button>

          <button
            type="button"
            onClick={handleCopy}
            disabled={activeCards.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-slate-700 text-slate-200 border border-slate-600 hover:bg-slate-600 disabled:opacity-40 transition whitespace-nowrap shrink-0"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copié' : 'Copier'}
          </button>

          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-white text-slate-800 hover:bg-slate-100 transition whitespace-nowrap shrink-0"
          >
            <X className="w-4 h-4" />
            Quitter le mode TNI
          </button>
        </div>
      </div>

      {/* Grille de cartes élèves sur fond sombre TNI */}
      <div className="flex-1 overflow-y-auto p-6 sm:p-8">
        {activeCards.length === 0 ? (
          <div className="max-w-xl mx-auto bg-white rounded-2xl shadow-lg p-10 text-center space-y-4">
            <p className="text-slate-700 text-base font-semibold">
              {sourceMode === 'checked'
                ? 'Aucune séquence cochée en saisie pour le moment.'
                : 'Aucun chapitre à travailler pour les élèves sélectionnés dans ce filtre.'}
            </p>
            {sourceMode === 'checked' && priorityCards.length > 0 && (
              <button
                type="button"
                onClick={() => setSourceMode('priority')}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white transition"
              >
                <ListOrdered className="w-4 h-4" />
                Afficher les chapitres par ordre de priorité ({priorityCards.length})
              </button>
            )}
          </div>
        ) : (
          <div className="max-w-7xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {activeCards.map(({ student, tasks, hasExpertHelper }) => {
              const visibleTasks =
                sourceMode === 'priority' && maxTasks > 0 ? tasks.slice(0, maxTasks) : tasks;
              const hiddenCount = tasks.length - visibleTasks.length;

              const hasSoloOrCurr = visibleTasks.some(
                t => t.assignment.mode === 'solo' || t.assignment.mode === 'curriculum'
              );
              const hasTutor = visibleTasks.some(t => t.assignment.mode === 'tutor');

              let headerLabel = 'Autonomie';
              let headerClass = 'text-emerald-700 bg-emerald-50';
              if (visibleTasks.length === 0 && hasExpertHelper) {
                headerLabel = 'Expert(e)';
                headerClass = 'text-violet-700 bg-violet-50';
              } else if (hasSoloOrCurr && hasTutor) {
                headerLabel = 'Autonomie · Binôme';
                headerClass = 'text-indigo-700 bg-indigo-50';
              } else if (hasTutor) {
                headerLabel = 'Binôme';
                headerClass = 'text-indigo-700 bg-indigo-50';
              }

              return (
                <div
                  key={student.id}
                  className="bg-white rounded-2xl shadow-lg border-2 border-indigo-100 p-5 flex flex-col justify-between"
                >
                  <div>
                    {/* En-tête de la carte : mode principal + niveau */}
                    <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-100 gap-2">
                      <span
                        className={cn(
                          'text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-md whitespace-nowrap',
                          headerClass
                        )}
                      >
                        {headerLabel}
                      </span>
                      <span className="text-xs font-semibold text-slate-500 tabular-nums">
                        {student.grade}
                      </span>
                    </div>

                    {/* Prénom bien lisible pour les élèves */}
                    <div
                      className={cn(
                        'font-extrabold text-slate-900 leading-tight',
                        largeText ? 'text-2xl' : 'text-xl'
                      )}
                    >
                      {student.firstName}
                    </div>
                    <div className="text-xs font-semibold text-slate-500 mt-0.5">
                      {student.lastName}
                    </div>
                  </div>

                  {/* Liste ordonnée des chapitres à travailler (sans aucune note) */}
                  <div className="mt-4 space-y-2.5">
                    {visibleTasks.map((task, idx) => {
                      const isTutor = task.assignment.mode === 'tutor';
                      const isCurr = task.assignment.mode === 'curriculum';
                      const codeColorClass = isTutor
                        ? 'text-indigo-700'
                        : isCurr
                          ? 'text-violet-700'
                          : 'text-emerald-700';

                      return (
                        <div
                          key={`${task.itemKey}_${idx}`}
                          className="bg-slate-50 rounded-xl px-3.5 py-2.5 border border-slate-200 space-y-1"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-xs font-bold text-slate-400 tabular-nums shrink-0">
                                {idx + 1}.
                              </span>
                              <span
                                className={cn(
                                  'font-mono font-extrabold truncate',
                                  codeColorClass,
                                  largeText ? 'text-base' : 'text-sm'
                                )}
                              >
                                {task.assignment.chapterCode}
                              </span>
                            </div>

                            {isTutor ? (
                              task.expert ? (
                                <span className="inline-flex items-center gap-1 text-xs font-bold text-violet-700 shrink-0">
                                  <UserCheck className="w-3.5 h-3.5 shrink-0" />
                                  avec {task.expert.firstName}
                                </span>
                              ) : (
                                <span className="text-xs font-semibold text-amber-700 shrink-0">
                                  avec l’enseignante
                                </span>
                              )
                            ) : (
                              <span
                                className={cn(
                                  'text-xs font-semibold shrink-0',
                                  isCurr ? 'text-violet-700' : 'text-emerald-700'
                                )}
                              >
                                {isCurr ? 'Approf.' : 'Seul(e)'}
                              </span>
                            )}
                          </div>

                          {task.assignment.chapterTitle &&
                            task.assignment.chapterTitle !== task.assignment.chapterCode && (
                              <p
                                className={cn(
                                  'font-semibold text-slate-800 leading-snug',
                                  largeText ? 'text-base' : 'text-sm'
                                )}
                              >
                                {task.assignment.chapterTitle}
                              </p>
                            )}
                        </div>
                      );
                    })}

                    {hasExpertHelper && (
                      <div className="bg-violet-50/70 rounded-xl px-3.5 py-2.5 border border-violet-200 flex items-center gap-2 text-violet-900">
                        <UserCheck className="w-4 h-4 text-violet-700 shrink-0" />
                        <span
                          className={cn(
                            'font-semibold leading-snug',
                            largeText ? 'text-base' : 'text-xs'
                          )}
                        >
                          Disponible pour aider un camarade
                        </span>
                      </div>
                    )}

                    {hiddenCount > 0 && (
                      <p className="text-xs font-medium text-slate-500 text-center pt-0.5 tabular-nums">
                        + {hiddenCount} autre{hiddenCount > 1 ? 's' : ''} chapitre
                        {hiddenCount > 1 ? 's' : ''}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
