import React, { useState, useMemo } from 'react';
import { Monitor, X, Layers, Users } from 'lucide-react';
import { Student, ApcModality } from '../types';
import { cn } from '../utils/helpers';

export interface ApcTniItem {
  student: Student;
  chapterCode: string;
  chapterTitle: string;
  domain: string;
  subDomain: string;
  modality: ApcModality;
}

interface ApcTniModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: ApcTniItem[];
  sessionDate: string;
  domainFilter: string;
  gradeFilter: string;
  sessionNotes: string;
}

function formatTniDate(isoDate: string): string {
  if (!isoDate) return '';
  const parts = isoDate.split('-');
  if (parts.length !== 3) return isoDate;
  const dateObj = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  if (isNaN(dateObj.getTime())) return isoDate;
  return dateObj.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  });
}

export default function ApcTniModal({
  isOpen,
  onClose,
  items,
  sessionDate,
  domainFilter,
  gradeFilter,
  sessionNotes
}: ApcTniModalProps) {
  const [displayMode, setDisplayMode] = useState<'modality' | 'student'>('modality');

  const autonomieItems = useMemo(
    () => items.filter(it => it.modality === 'autonomie'),
    [items]
  );

  const individuelItems = useMemo(
    () => items.filter(it => it.modality === 'individuel'),
    [items]
  );

  if (!isOpen) return null;

  const formattedDate = formatTniDate(sessionDate);
  const subtitleParts: string[] = [];
  if (formattedDate) subtitleParts.push(formattedDate);
  if (gradeFilter !== 'all') subtitleParts.push(gradeFilter);
  if (domainFilter !== 'all') subtitleParts.push(domainFilter);
  subtitleParts.push(`${items.length} élève${items.length > 1 ? 's' : ''}`);
  if (sessionNotes.trim()) subtitleParts.push(sessionNotes.trim());

  const modalityGroups: Array<{
    key: ApcModality;
    title: string;
    badgeClass: string;
    cardBorderClass: string;
    list: ApcTniItem[];
  }> = [
    {
      key: 'individuel' as ApcModality,
      title: 'Individuel',
      badgeClass: 'text-indigo-700 bg-indigo-50',
      cardBorderClass: 'border-indigo-100',
      list: individuelItems
    },
    {
      key: 'autonomie' as ApcModality,
      title: 'En autonomie',
      badgeClass: 'text-emerald-700 bg-emerald-50',
      cardBorderClass: 'border-emerald-100',
      list: autonomieItems
    }
  ].filter(group => group.list.length > 0);

  return (
    <div className="fixed inset-0 bg-slate-900 z-[100] flex flex-col overflow-hidden">
      {/* Barre supérieure sombre sobre, alignée sur l'affichage TNI Binômes / Équipes */}
      <div className="bg-slate-800 border-b border-slate-700 px-6 py-4 flex flex-wrap items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow">
            <Monitor className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">
              APC — Programme de la séance
            </h2>
            <p className="text-xs text-slate-300 capitalize">
              {subtitleParts.join(' • ')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center bg-slate-700 p-1 rounded-lg border border-slate-600">
            <button
              type="button"
              onClick={() => setDisplayMode('modality')}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition',
                displayMode === 'modality'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-200 hover:text-white'
              )}
            >
              <Layers className="w-3.5 h-3.5" />
              Par modalité
            </button>
            <button
              type="button"
              onClick={() => setDisplayMode('student')}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition',
                displayMode === 'student'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-200 hover:text-white'
              )}
            >
              <Users className="w-3.5 h-3.5" />
              Par élève
            </button>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-white text-slate-800 hover:bg-slate-100 transition"
          >
            <X className="w-4 h-4" />
            Quitter le mode TNI
          </button>
        </div>
      </div>

      {/* Corps TNI sobre sans aucun score */}
      <div className="flex-1 overflow-y-auto p-6 sm:p-8">
        {items.length === 0 ? (
          <div className="max-w-xl mx-auto bg-white rounded-2xl shadow-lg p-10 text-center text-slate-600 text-base font-medium">
            Sélectionnez au moins un élève et un chapitre pour afficher la séance au TNI.
          </div>
        ) : displayMode === 'modality' ? (
          <div
            className={cn(
              'mx-auto grid gap-6 items-start',
              modalityGroups.length === 1
                ? 'max-w-3xl grid-cols-1'
                : 'max-w-6xl grid-cols-1 lg:grid-cols-2'
            )}
          >
            {modalityGroups.map(group => (
              <div
                key={group.key}
                className={cn(
                  'bg-white rounded-2xl shadow-lg border-2 p-5 flex flex-col',
                  group.cardBorderClass
                )}
              >
                <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100">
                  <span
                    className={cn(
                      'text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-md',
                      group.badgeClass
                    )}
                  >
                    {group.title}
                  </span>
                  <span className="text-xs font-semibold text-slate-500">
                    {group.list.length} élève{group.list.length > 1 ? 's' : ''}
                  </span>
                </div>

                <div className="space-y-2.5">
                  {group.list.map(item => (
                    <div
                      key={item.student.id}
                      className="flex items-center justify-between gap-4 bg-slate-50 rounded-xl px-4 py-3 border border-slate-200"
                    >
                      <div className="min-w-0 shrink-0">
                        <div className="text-lg font-extrabold text-slate-900 leading-tight">
                          {item.student.firstName}
                        </div>
                        <div className="text-xs font-semibold text-slate-500">
                          {item.student.lastName} • {item.student.grade}
                        </div>
                      </div>

                      <div className="text-right min-w-0">
                        <div className="flex items-center justify-end gap-2 flex-wrap">
                          {item.domain && (
                            <span className="text-[11px] font-semibold text-slate-500">
                              {item.domain}
                            </span>
                          )}
                          <span className="inline-block font-mono text-sm font-extrabold text-indigo-700 bg-white px-2.5 py-0.5 rounded-lg border border-slate-200">
                            {item.chapterCode}
                          </span>
                        </div>
                        {item.chapterTitle && item.chapterTitle !== item.chapterCode && (
                          <p className="text-sm font-semibold text-slate-700 mt-1 leading-snug">
                            {item.chapterTitle}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="max-w-7xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {items.map(item => (
              <div
                key={item.student.id}
                className="bg-white rounded-2xl shadow-lg border-2 border-indigo-100 p-5 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-100">
                    <span
                      className={cn(
                        'text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-md',
                        item.modality === 'autonomie'
                          ? 'text-emerald-700 bg-emerald-50'
                          : 'text-indigo-700 bg-indigo-50'
                      )}
                    >
                      {item.modality === 'autonomie' ? 'Autonomie' : 'Individuel'}
                    </span>
                    <span className="text-xs font-semibold text-slate-500">
                      {item.student.grade}
                    </span>
                  </div>

                  <div className="text-xl font-extrabold text-slate-900 leading-tight">
                    {item.student.firstName}
                  </div>
                  <div className="text-xs font-semibold text-slate-500 mt-0.5">
                    {item.student.lastName}
                  </div>
                </div>

                <div className="mt-4 bg-slate-50 rounded-xl px-3.5 py-3 border border-slate-200 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-sm font-extrabold text-indigo-700">
                      {item.chapterCode}
                    </span>
                    {item.domain && (
                      <span className="text-[11px] font-semibold text-slate-500 truncate">
                        {item.domain}
                      </span>
                    )}
                  </div>
                  {item.chapterTitle && item.chapterTitle !== item.chapterCode && (
                    <p className="text-sm font-semibold text-slate-800 leading-snug">
                      {item.chapterTitle}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
