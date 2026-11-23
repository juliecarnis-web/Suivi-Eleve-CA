import React, { useState, useMemo, useEffect } from 'react';
import {
  X,
  FileText,
  RefreshCw,
  Copy,
  Check,
  Calendar,
  CheckCircle2,
  Users
} from 'lucide-react';
import { ApcEntry, Competence, Result, Student } from '../types';
import { cn } from '../utils/helpers';
import {
  ApcBilanStyle,
  filterApcEntriesByDateRange,
  groupApcSessions,
  generateStudentApcBilan,
  generateClassApcBilanText,
  formatDateFr
} from '../utils/apcBilanGenerator';

interface ApcBilanModalProps {
  isOpen: boolean;
  onClose: () => void;
  apcEntries: ApcEntry[];
  students: Student[];
  competences?: Competence[];
  results: Record<string, Record<number, Result>>;
  uniqueGrades: string[];
  initialStartDate?: string;
  initialEndDate?: string;
}

function getTodayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getDaysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function ApcBilanModal({
  isOpen,
  onClose,
  apcEntries,
  students,
  competences = [],
  results,
  uniqueGrades,
  initialStartDate,
  initialEndDate
}: ApcBilanModalProps) {
  const todayIso = useMemo(() => getTodayIso(), []);
  const earliestEntryDate = useMemo(() => {
    if (apcEntries.length === 0) return getDaysAgoIso(60);
    return apcEntries.reduce(
      (min, e) => (e.session_date && e.session_date < min ? e.session_date : min),
      apcEntries[0].session_date || todayIso
    );
  }, [apcEntries, todayIso]);

  const [startDate, setStartDate] = useState<string>(initialStartDate || earliestEntryDate);
  const [endDate, setEndDate] = useState<string>(initialEndDate || todayIso);
  const [gradeFilter, setGradeFilter] = useState<string>('all');
  const [studentFilter, setStudentFilter] = useState<string>('all');

  const [style, setStyle] = useState<ApcBilanStyle>('lsu');
  const [includeDetails, setIncludeDetails] = useState<boolean>(true);
  const [variant, setVariant] = useState<number>(0);
  const [viewMode, setViewMode] = useState<'students' | 'global'>('students');

  const [globalDraft, setGlobalDraft] = useState<string>('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      setStartDate(initialStartDate || earliestEntryDate);
      setEndDate(initialEndDate || todayIso);
    }
  }, [isOpen, initialStartDate, initialEndDate, earliestEntryDate, todayIso]);

  const competenceMap = useMemo(
    () => new Map(competences.map(c => [c.id, c])),
    [competences]
  );

  const periodEntries = useMemo(() => {
    const byDate = filterApcEntriesByDateRange(apcEntries, startDate, endDate).map(e => {
      if (e.chapter_title && e.chapter_title.trim() && e.chapter_title.trim() !== e.chapter_code) {
        return e;
      }
      const comp = e.competence_id !== null ? competenceMap.get(e.competence_id) : undefined;
      if (!comp || !comp.title) return e;
      const cleaned = comp.title.includes(' : ')
        ? comp.title.split(' : ').slice(1).join(' : ').trim()
        : comp.title.trim();
      return cleaned ? { ...e, chapter_title: cleaned } : e;
    });
    if (gradeFilter === 'all' && studentFilter === 'all') return byDate;

    const studentMap = new Map(students.map(s => [s.id, s]));
    return byDate.filter(e => {
      if (studentFilter !== 'all' && e.student_id !== studentFilter) return false;
      if (gradeFilter !== 'all') {
        const st = studentMap.get(e.student_id);
        if (!st || st.grade !== gradeFilter) return false;
      }
      return true;
    });
  }, [apcEntries, startDate, endDate, gradeFilter, studentFilter, students, competenceMap]);

  const sessionsSummary = useMemo(() => groupApcSessions(periodEntries), [periodEntries]);

  const studentBilans = useMemo(() => {
    if (!isOpen) return [];
    const presentStudentIds = new Set(periodEntries.map(e => e.student_id));
    return students
      .filter(s => presentStudentIds.has(s.id))
      .sort((a, b) => a.lastName.localeCompare(b.lastName, 'fr') || a.firstName.localeCompare(b.firstName, 'fr'))
      .map((st, idx) =>
        generateStudentApcBilan(st, periodEntries, results, startDate, endDate, {
          style,
          includeDetails,
          variant: (variant + idx) % 3
        })
      )
      .filter((item): item is NonNullable<typeof item> => item !== null);
  }, [isOpen, periodEntries, students, results, startDate, endDate, style, includeDetails, variant]);

  const generatedGlobalText = useMemo(() => {
    if (!isOpen) return '';
    return generateClassApcBilanText(periodEntries, students, results, startDate, endDate, {
      style,
      includeDetails,
      variant
    });
  }, [isOpen, periodEntries, students, results, startDate, endDate, style, includeDetails, variant]);

  useEffect(() => {
    setGlobalDraft(generatedGlobalText);
  }, [generatedGlobalText]);

  if (!isOpen) return null;

  const handleCopyOne = (id: string, text: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  const handleCopyAll = () => {
    const textToCopy =
      viewMode === 'global'
        ? globalDraft
        : studentBilans
            .map(b => `${b.student.firstName} ${b.student.lastName.toUpperCase()} (${b.student.grade}) :\n${b.text}`)
            .join('\n\n');
    if (!textToCopy.trim()) return;
    navigator.clipboard?.writeText(textToCopy);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
  };

  const studentsInHistory = Array.from(new Set(apcEntries.map(e => e.student_id)))
    .map(id => students.find(s => s.id === id))
    .filter((s): s is Student => Boolean(s))
    .sort((a, b) => a.lastName.localeCompare(b.lastName, 'fr') || a.firstName.localeCompare(b.firstName, 'fr'));

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] border border-slate-200 flex flex-col overflow-hidden">
        {/* En-tête */}
        <div className="px-6 py-4 bg-indigo-700 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-indigo-600 flex items-center justify-center border border-indigo-500">
              <FileText className="w-5 h-5 text-indigo-100" />
            </div>
            <div>
              <h3 className="font-bold text-base">Générateur de Bilan APC (de Date à Date)</h3>
              <p className="text-xs text-indigo-200">
                Synthèse automatique des séances APC enregistrées — prête pour le LSU, les parents ou le suivi de période.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-indigo-200 hover:text-white transition p-1.5 rounded-lg hover:bg-indigo-600/50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Barre de critères date à date & style */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 space-y-3 shrink-0">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">Du</label>
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">Au</label>
              <input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>

            <div className="flex items-center gap-1.5 pb-0.5">
              <button
                type="button"
                onClick={() => {
                  setStartDate(getDaysAgoIso(30));
                  setEndDate(todayIso);
                }}
                className="px-2.5 py-1.5 text-[11px] font-semibold bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-md transition"
              >
                30 derniers jours
              </button>
              <button
                type="button"
                onClick={() => {
                  setStartDate(earliestEntryDate);
                  setEndDate(todayIso);
                }}
                className="px-2.5 py-1.5 text-[11px] font-semibold bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-md transition"
              >
                Tout l’historique
              </button>
            </div>

            <div className="ml-auto flex flex-wrap items-end gap-2.5">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Niveau</label>
                <select
                  value={gradeFilter}
                  onChange={e => {
                    setGradeFilter(e.target.value);
                    setStudentFilter('all');
                  }}
                  className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none"
                >
                  <option value="all">Tous</option>
                  {uniqueGrades.map(g => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Élève</label>
                <select
                  value={studentFilter}
                  onChange={e => setStudentFilter(e.target.value)}
                  className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none max-w-[180px]"
                >
                  <option value="all">Tous ({studentsInHistory.length})</option>
                  {studentsInHistory
                    .filter(s => gradeFilter === 'all' || s.grade === gradeFilter)
                    .map(s => (
                      <option key={s.id} value={s.id}>
                        {s.firstName} {s.lastName}
                      </option>
                    ))}
                </select>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-200">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center bg-white p-0.5 rounded-lg border border-slate-300 text-xs">
                <button
                  type="button"
                  onClick={() => setStyle('lsu')}
                  className={cn(
                    'px-2.5 py-1 rounded-md font-bold transition',
                    style === 'lsu' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
                  )}
                >
                  LSU (Officiel)
                </button>
                <button
                  type="button"
                  onClick={() => setStyle('parents')}
                  className={cn(
                    'px-2.5 py-1 rounded-md font-bold transition',
                    style === 'parents' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
                  )}
                >
                  Parents (Bienveillant)
                </button>
                <button
                  type="button"
                  onClick={() => setStyle('synthese')}
                  className={cn(
                    'px-2.5 py-1 rounded-md font-bold transition',
                    style === 'synthese' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
                  )}
                >
                  Synthèse (Suivi)
                </button>
              </div>

              <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 px-2.5 py-1.5 rounded-lg cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeDetails}
                  onChange={e => setIncludeDetails(e.target.checked)}
                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span>Dates &amp; codes précis</span>
              </label>

              <button
                type="button"
                onClick={() => setVariant(v => v + 1)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 transition"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Varier la formulation
              </button>
            </div>

            <div className="flex items-center bg-slate-200/70 p-0.5 rounded-lg text-xs">
              <button
                type="button"
                onClick={() => setViewMode('students')}
                className={cn(
                  'px-2.5 py-1 rounded-md font-bold transition flex items-center gap-1',
                  viewMode === 'students' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600'
                )}
              >
                <Users className="w-3.5 h-3.5" />
                Par élève ({studentBilans.length})
              </button>
              <button
                type="button"
                onClick={() => setViewMode('global')}
                className={cn(
                  'px-2.5 py-1 rounded-md font-bold transition flex items-center gap-1',
                  viewMode === 'global' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600'
                )}
              >
                <Calendar className="w-3.5 h-3.5" />
                Bilan global
              </button>
            </div>
          </div>
        </div>

        {/* Corps résultats */}
        <div className="flex-1 overflow-y-auto p-5 bg-slate-50/50 space-y-4">
          {periodEntries.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-sm text-slate-500">
              Aucune séance APC enregistrée du <strong>{formatDateFr(startDate)}</strong> au{' '}
              <strong>{formatDateFr(endDate)}</strong> pour ce filtre.
            </div>
          ) : viewMode === 'students' ? (
            <div className="space-y-3">
              {studentBilans.map(b => (
                <div
                  key={b.student.id}
                  className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs space-y-2.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-extrabold text-slate-800">
                        {b.student.firstName} <span className="uppercase">{b.student.lastName}</span>
                      </span>
                      <span className="text-[11px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                        {b.student.grade}
                      </span>
                      <span className="text-[11px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                        {b.sessionCount} séance{b.sessionCount > 1 ? 's' : ''}
                      </span>
                      {b.chapters.some(c => c.isNowValidated) && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3" />
                          {b.chapters.filter(c => c.isNowValidated).length} notion(s) validée(s) depuis
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => handleCopyOne(b.student.id, b.text)}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 transition"
                    >
                      {copiedId === b.student.id ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                          Copié
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          Copier
                        </>
                      )}
                    </button>
                  </div>

                  <p className="text-sm text-slate-700 leading-relaxed bg-slate-50 border border-slate-200 rounded-lg p-3 whitespace-pre-line">
                    {b.text}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs space-y-3">
              <div className="flex items-center justify-between text-xs text-slate-600">
                <span>
                  Synthèse globale modifiable : <strong>{sessionsSummary.length}</strong> séance(s) •{' '}
                  <strong>{studentBilans.length}</strong> élève(s)
                </span>
              </div>
              <textarea
                value={globalDraft}
                onChange={e => setGlobalDraft(e.target.value)}
                rows={12}
                className="w-full p-3.5 text-sm text-slate-800 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none leading-relaxed font-sans"
              />
            </div>
          )}
        </div>

        {/* Pied de modale */}
        <div className="px-6 py-3.5 bg-white border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-slate-500">
            {sessionsSummary.length} séance(s) • {studentBilans.length} élève(s) • du {formatDateFr(startDate)} au{' '}
            {formatDateFr(endDate)}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition"
            >
              Fermer
            </button>
            <button
              type="button"
              onClick={handleCopyAll}
              disabled={periodEntries.length === 0}
              className="flex items-center gap-2 px-4 py-2 text-sm font-bold bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-lg shadow transition"
            >
              {copiedAll ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copiedAll ? 'Copié !' : viewMode === 'global' ? 'Copier le bilan global' : 'Tout copier (LSU / Parents)'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
