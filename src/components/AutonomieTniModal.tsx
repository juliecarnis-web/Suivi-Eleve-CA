import React, { useState, useMemo } from 'react';
import { X, Monitor, Copy, Check, Sparkles, UserCheck, Maximize2, Minimize2 } from 'lucide-react';
import { Student } from '../types';
import { cn } from '../utils/helpers';
import { AutonomieAssignment } from '../utils/autonomieRecommender';

export interface TniPlanItem {
  itemKey: string;
  student: Student;
  assignment: AutonomieAssignment;
  expert: Student | null;
}

interface AutonomieTniModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: TniPlanItem[];
  domainLabel: string;
  subDomainLabel: string;
}

export default function AutonomieTniModal({
  isOpen,
  onClose,
  items,
  domainLabel,
  subDomainLabel
}: AutonomieTniModalProps) {
  const [largeText, setLargeText] = useState<boolean>(true);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(true);
  const [copied, setCopied] = useState<boolean>(false);

  const soloGroupedByStudent = useMemo(() => {
    const soloRaw = items.filter(
      it => it.assignment.mode === 'solo' || it.assignment.mode === 'curriculum'
    );
    const map = new Map<string, { student: Student; tasks: AutonomieAssignment[] }>();
    soloRaw.forEach(({ student, assignment }) => {
      const existing = map.get(student.id);
      if (existing) {
        existing.tasks.push(assignment);
      } else {
        map.set(student.id, { student, tasks: [assignment] });
      }
    });
    return Array.from(map.values());
  }, [items]);

  const tutorItems = useMemo(
    () => items.filter(it => it.assignment.mode === 'tutor'),
    [items]
  );

  const expertHelperItems = useMemo(
    () => items.filter(it => it.assignment.mode === 'expert_helper'),
    [items]
  );

  if (!isOpen) return null;

  const todayStr = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  });

  const handleCopy = () => {
    const lines: string[] = [
      `Aujourd'hui en autonomie, je débloque, je progresse, je valide ! (${todayStr})`,
      domainLabel !== 'all'
        ? `Domaine : ${domainLabel}${subDomainLabel !== 'all' ? ` • ${subDomainLabel}` : ''}`
        : '',
      ''
    ].filter((l, i) => i === 0 || l !== '' || i === 2);

    if (soloGroupedByStudent.length > 0) {
      lines.push('--- Je progresse et je valide seul(e) ---');
      soloGroupedByStudent.forEach(({ student, tasks }) => {
        const desc = tasks
          .map(
            t =>
              `${t.chapterCode}${t.chapterTitle && t.chapterTitle !== t.chapterCode ? ` (${t.chapterTitle})` : ''}`
          )
          .join(' ; ');
        lines.push(`• ${student.firstName} : ${desc}`);
      });
      lines.push('');
    }

    if (tutorItems.length > 0) {
      lines.push('--- Je débloque avec un(e) expert(e) ---');
      tutorItems.forEach(({ student, assignment, expert }) => {
        const partner = expert ? ` (avec ${expert.firstName})` : '';
        lines.push(
          `• ${student.firstName}${partner} : ${assignment.chapterCode}${
            assignment.chapterTitle && assignment.chapterTitle !== assignment.chapterCode
              ? ` — ${assignment.chapterTitle}`
              : ''
          }`
        );
      });
      lines.push('');
    }

    if (expertHelperItems.length > 0) {
      lines.push(
        `--- Expert(e)s disponibles pour aider : ${expertHelperItems.map(e => e.student.firstName).join(', ')} ---`
      );
    }

    navigator.clipboard?.writeText(lines.join('\n').trim());
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div
      className={cn(
        'fixed inset-0 z-[100] bg-slate-900/75 backdrop-blur-xs flex items-center justify-center',
        isFullscreen ? 'p-0' : 'p-4 md:p-8'
      )}
    >
      <div
        className={cn(
          'bg-slate-50 flex flex-col overflow-hidden shadow-2xl border border-slate-200',
          isFullscreen ? 'w-full h-full rounded-none' : 'w-full max-w-6xl max-h-[92vh] rounded-2xl'
        )}
      >
        {/* Bandeau TNI encourageant (aucune note affichée) */}
        <div className="bg-gradient-to-r from-indigo-700 via-indigo-600 to-emerald-600 text-white px-6 py-5 shrink-0">
          <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-wider text-indigo-100">
                <Monitor className="w-4 h-4" />
                <span className="capitalize">{todayStr}</span>
                {domainLabel !== 'all' && (
                  <span className="bg-white/15 px-2.5 py-0.5 rounded-full">
                    {domainLabel}
                    {subDomainLabel !== 'all' ? ` • ${subDomainLabel}` : ''}
                  </span>
                )}
              </div>
              <h2 className="text-xl md:text-3xl font-extrabold tracking-tight flex items-center gap-2.5">
                <Sparkles className="w-6 h-6 md:w-7 md:h-7 text-amber-300 shrink-0" />
                <span>Aujourd’hui en autonomie, je débloque, je progresse, je valide !</span>
              </h2>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setLargeText(v => !v)}
                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-white/15 hover:bg-white/25 text-white border border-white/20 transition"
              >
                {largeText ? 'Texte standard' : 'Grand texte TNI'}
              </button>
              <button
                type="button"
                onClick={handleCopy}
                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-white/15 hover:bg-white/25 text-white border border-white/20 transition flex items-center gap-1.5"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copié' : 'Copier'}
              </button>
              <button
                type="button"
                onClick={() => setIsFullscreen(v => !v)}
                className="p-2 rounded-lg bg-white/15 hover:bg-white/25 text-white border border-white/20 transition"
                title={isFullscreen ? 'Réduire la fenêtre' : 'Plein écran TNI'}
              >
                {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-lg bg-white/15 hover:bg-white/25 text-white border border-white/20 transition"
                title="Fermer l'affichage TNI"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Corps TNI sans notes */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-7xl mx-auto space-y-6">
            {items.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-500 text-base">
                Cochez au moins une séquence à travailler côté enseignant pour qu’elle apparaisse au TNI.
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                {/* Colonne 1 : Je progresse seul(e) */}
                <div className="bg-white rounded-2xl border-2 border-emerald-200 shadow-sm overflow-hidden">
                  <div className="px-5 py-3.5 bg-emerald-600 text-white flex items-center justify-between">
                    <h3 className={cn('font-extrabold', largeText ? 'text-lg md:text-xl' : 'text-base')}>
                      Je progresse et je valide seul(e)
                    </h3>
                    <span className="text-xs font-bold bg-white/20 px-2.5 py-1 rounded-full">
                      {soloGroupedByStudent.length} élève{soloGroupedByStudent.length > 1 ? 's' : ''}
                    </span>
                  </div>

                  {soloGroupedByStudent.length === 0 ? (
                    <div className="p-6 text-sm text-slate-400 text-center">
                      Aucune séquence cochée sur ce parcours.
                    </div>
                  ) : (
                    <div className="divide-y divide-emerald-100">
                      {soloGroupedByStudent.map(({ student, tasks }) => (
                        <div
                          key={student.id}
                          className="px-5 py-3.5 flex items-start justify-between gap-4 hover:bg-emerald-50/40 transition"
                        >
                          <div className="flex items-center gap-2.5 shrink-0 pt-0.5">
                            <span
                              className={cn(
                                'font-extrabold text-slate-900',
                                largeText ? 'text-lg md:text-xl' : 'text-sm'
                              )}
                            >
                              {student.firstName}
                            </span>
                            <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                              {student.grade}
                            </span>
                          </div>

                          <div className="space-y-2 text-right min-w-0 flex-1">
                            {tasks.map((task, idx) => (
                              <div key={`${task.chapterCode}_${idx}`}>
                                <span
                                  className={cn(
                                    'inline-block font-mono font-extrabold text-emerald-800 bg-emerald-100 border border-emerald-200 px-2.5 py-0.5 rounded-md',
                                    largeText ? 'text-sm md:text-base' : 'text-xs'
                                  )}
                                >
                                  {task.chapterCode}
                                </span>
                                {task.chapterTitle && task.chapterTitle !== task.chapterCode && (
                                  <p
                                    className={cn(
                                      'text-slate-700 font-semibold mt-0.5 truncate max-w-xs md:max-w-sm ml-auto',
                                      largeText ? 'text-sm md:text-base' : 'text-xs'
                                    )}
                                  >
                                    {task.chapterTitle}
                                  </p>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Colonne 2 : Je débloque avec un(e) expert(e) */}
                <div className="bg-white rounded-2xl border-2 border-indigo-200 shadow-sm overflow-hidden">
                  <div className="px-5 py-3.5 bg-indigo-600 text-white flex items-center justify-between">
                    <h3 className={cn('font-extrabold', largeText ? 'text-lg md:text-xl' : 'text-base')}>
                      Je débloque avec un(e) expert(e)
                    </h3>
                    <span className="text-xs font-bold bg-white/20 px-2.5 py-1 rounded-full">
                      {tutorItems.length} séquence{tutorItems.length > 1 ? 's' : ''}
                    </span>
                  </div>

                  {tutorItems.length === 0 ? (
                    <div className="p-6 text-sm text-slate-400 text-center">
                      Aucune séquence en binôme cochée pour cette séance.
                    </div>
                  ) : (
                    <div className="divide-y divide-indigo-100">
                      {tutorItems.map(({ itemKey, student, assignment, expert }) => (
                        <div
                          key={itemKey}
                          className="px-5 py-3.5 flex items-center justify-between gap-4 hover:bg-indigo-50/40 transition"
                        >
                          <div className="space-y-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={cn(
                                  'font-extrabold text-slate-900',
                                  largeText ? 'text-lg md:text-xl' : 'text-sm'
                                )}
                              >
                                {student.firstName}
                              </span>
                              {expert ? (
                                <span
                                  className={cn(
                                    'inline-flex items-center gap-1.5 font-extrabold text-violet-800 bg-violet-100 border border-violet-200 px-2.5 py-0.5 rounded-md',
                                    largeText ? 'text-sm md:text-base' : 'text-xs'
                                  )}
                                >
                                  <UserCheck className="w-4 h-4 text-violet-700 shrink-0" />
                                  avec {expert.firstName}
                                </span>
                              ) : (
                                <span className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
                                  avec l’enseignante
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="text-right min-w-0">
                            <span
                              className={cn(
                                'inline-block font-mono font-extrabold text-indigo-800 bg-indigo-100 border border-indigo-200 px-2.5 py-0.5 rounded-md',
                                largeText ? 'text-sm md:text-base' : 'text-xs'
                              )}
                            >
                              {assignment.chapterCode}
                            </span>
                            {assignment.chapterTitle && assignment.chapterTitle !== assignment.chapterCode && (
                              <p
                                className={cn(
                                  'text-slate-700 font-semibold mt-0.5 truncate max-w-xs md:max-w-sm',
                                  largeText ? 'text-sm md:text-base' : 'text-xs'
                                )}
                              >
                                {assignment.chapterTitle}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Expert(e)s / tuteur(trice)s disponibles */}
            {expertHelperItems.length > 0 && (
              <div className="bg-white rounded-2xl border border-violet-200 shadow-sm p-4 flex flex-wrap items-center gap-3">
                <span className="text-xs font-extrabold uppercase tracking-wider text-violet-800 flex items-center gap-1.5">
                  <UserCheck className="w-4 h-4 text-violet-600" />
                  Expert(e)s ressources / tutorat disponibles :
                </span>
                <div className="flex flex-wrap gap-2">
                  {expertHelperItems.map(({ itemKey, student }) => (
                    <span
                      key={itemKey}
                      className={cn(
                        'font-bold text-violet-900 bg-violet-50 border border-violet-200 px-3 py-1 rounded-lg',
                        largeText ? 'text-base' : 'text-xs'
                      )}
                    >
                      {student.firstName} ({student.grade})
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
