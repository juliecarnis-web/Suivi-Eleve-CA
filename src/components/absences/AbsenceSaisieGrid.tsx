import React, { useState, useEffect, useMemo } from 'react';
import {
  Save,
  CheckCircle2,
  AlertCircle,
  Lock,
  Unlock,
  Search,
  CalendarRange,
} from 'lucide-react';
import { AbsenceConfig, Student, StudentAbsenceRecord } from '../../types';
import {
  buildPeriodMonthSegments,
  countWorkingHalfDays,
  formatDateFr,
} from '../../utils/absences';

interface AbsenceSaisieGridProps {
  students: Student[];
  config: AbsenceConfig;
  records: StudentAbsenceRecord[];
  isEditMode: boolean;
  handleToggleEditMode?: () => void;
  onOpenSettings: () => void;
  onSaveSegmentRecords: (payload: {
    schoolYear: string;
    period: number;
    monthKey: string;
    startDate: string;
    endDate: string;
    headcount: number;
    segmentKey: string;
    entries: Array<{
      studentId: string;
      absentHalfDays: number;
      justifiedHalfDays: number;
      notes?: string;
    }>;
  }) => Promise<void>;
}

interface RowDraft {
  absent: string;
  justified: string;
  notes: string;
}

export default function AbsenceSaisieGrid({
  students,
  config,
  records,
  isEditMode,
  handleToggleEditMode,
  onOpenSettings,
  onSaveSegmentRecords,
}: AbsenceSaisieGridProps) {
  const activeStudents = useMemo(
    () =>
      students
        .filter((s) => !s.isArchived)
        .sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName)),
    [students]
  );

  const uniqueGrades = useMemo(
    () => Array.from(new Set(activeStudents.map((s) => s.grade))).sort(),
    [activeStudents]
  );

  const segments = useMemo(() => buildPeriodMonthSegments(config), [config]);

  const [entryMode, setEntryMode] = useState<'monthly' | 'period'>('monthly');
  const [selectedSegmentKey, setSelectedSegmentKey] = useState<string>('');
  const [selectedPeriodNum, setSelectedPeriodNum] = useState<number>(1);
  const [selectedGrade, setSelectedGrade] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Choisir automatiquement le segment le plus proche de la date du jour au premier chargement
  useEffect(() => {
    if (segments.length === 0) return;
    const stillExists = segments.some((s) => s.key === selectedSegmentKey);
    if (stillExists) return;

    const todayStr = new Date().toISOString().slice(0, 10);
    const currentSeg =
      segments.find((s) => todayStr >= s.startDate && todayStr <= s.endDate) || segments[0];
    setSelectedSegmentKey(currentSeg.key);
  }, [segments, selectedSegmentKey]);

  // Métadonnées actives de la tranche sélectionnée (soit segment (mois, période), soit période globale)
  const activeTarget = useMemo(() => {
    if (entryMode === 'monthly') {
      const seg = segments.find((s) => s.key === selectedSegmentKey) || segments[0];
      if (!seg) return null;
      return {
        segmentKey: seg.key,
        period: seg.period,
        monthKey: seg.monthKey,
        label: `${seg.monthLabel} · ${seg.periodLabel}`,
        startDate: seg.startDate,
        endDate: seg.endDate,
        workingDays: seg.workingDays,
        workingHalfDays: seg.workingHalfDays,
      };
    }

    const p =
      (config.periods || []).find((item) => item.period === selectedPeriodNum) ||
      config.periods?.[0];
    if (!p || !p.start || !p.end) return null;
    const counts = countWorkingHalfDays(p.start, p.end, config);
    return {
      segmentKey: `ALL_P${p.period}`,
      period: p.period,
      monthKey: 'ALL',
      label: `${p.label || `Période ${p.period}`} (saisie globale)`,
      startDate: p.start,
      endDate: p.end,
      workingDays: counts.workingDays,
      workingHalfDays: counts.workingHalfDays,
    };
  }, [entryMode, segments, selectedSegmentKey, config, selectedPeriodNum]);

  const activeCount = activeStudents.length;
  const [gridData, setGridData] = useState<Record<string, RowDraft>>({});
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [saveError, setSaveError] = useState('');

  // Synchroniser la grille à chaque changement de segment / records
  useEffect(() => {
    if (!activeTarget) return;

    const nextMap: Record<string, RowDraft> = {};
    activeStudents.forEach((st) => {
      const existing = records.find(
        (r) =>
          r.school_year === config.school_year &&
          Number(r.period) === activeTarget.period &&
          r.month_key === activeTarget.monthKey &&
          r.student_id === st.id
      );
      nextMap[st.id] = {
        absent: existing && existing.absent_half_days > 0 ? String(existing.absent_half_days) : '',
        justified:
          existing && existing.justified_half_days > 0 ? String(existing.justified_half_days) : '',
        notes: existing?.notes || '',
      };
    });
    setGridData(nextMap);
    setSaveError('');
  }, [activeTarget, config.school_year, records, activeStudents]);

  const filteredStudents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return activeStudents.filter((st) => {
      if (selectedGrade !== 'all' && st.grade !== selectedGrade) return false;
      if (q) {
        const full = `${st.lastName} ${st.firstName}`.toLowerCase();
        if (!full.includes(q)) return false;
      }
      return true;
    });
  }, [activeStudents, selectedGrade, searchQuery]);

  // Totaux en direct sur l'ensemble de la classe pour ce segment
  const liveTotals = useMemo(() => {
    let totalAbsent = 0;
    let totalJustified = 0;
    activeStudents.forEach((st) => {
      const row = gridData[st.id];
      if (!row) return;
      const a = Math.max(0, parseFloat(row.absent) || 0);
      const j = Math.min(a, Math.max(0, parseFloat(row.justified) || 0));
      totalAbsent += a;
      totalJustified += j;
    });

    const workingHalfDays = activeTarget?.workingHalfDays || 0;
    const possiblePresences = activeCount * workingHalfDays;
    const rate = possiblePresences > 0 ? (totalAbsent / possiblePresences) * 100 : 0;

    return {
      totalAbsent: Math.round(totalAbsent * 10) / 10,
      totalJustified: Math.round(totalJustified * 10) / 10,
      totalUnjustified: Math.max(0, Math.round((totalAbsent - totalJustified) * 10) / 10),
      possiblePresences,
      rate,
    };
  }, [activeStudents, gridData, activeCount, activeTarget]);

  const hasMonthlyOverlapInSelectedPeriod = useMemo(() => {
    if (entryMode !== 'period' || !activeTarget) return false;
    return records.some(
      (r) =>
        r.school_year === config.school_year &&
        Number(r.period) === activeTarget.period &&
        r.month_key !== 'ALL' &&
        r.absent_half_days > 0
    );
  }, [entryMode, activeTarget, records, config.school_year]);

  const handleFieldChange = (
    studentId: string,
    field: keyof RowDraft,
    value: string
  ) => {
    setGridData((prev) => {
      const current = prev[studentId] || { absent: '', justified: '', notes: '' };
      const updated = { ...current, [field]: value };

      // Cohérence : justifiées <= absences
      if (field === 'absent') {
        const aVal = parseFloat(value);
        const jVal = parseFloat(current.justified);
        if (!isNaN(jVal) && (isNaN(aVal) || jVal > aVal)) {
          updated.justified = isNaN(aVal) || aVal <= 0 ? '' : String(aVal);
        }
      } else if (field === 'justified') {
        const aVal = parseFloat(current.absent) || 0;
        const jVal = parseFloat(value);
        if (!isNaN(jVal) && jVal > aVal) {
          updated.justified = String(aVal);
        }
      }

      return { ...prev, [studentId]: updated };
    });
  };

  const handleStep = (studentId: string, field: 'absent' | 'justified', delta: number) => {
    if (!isEditMode) return;
    const current = gridData[studentId] || { absent: '', justified: '', notes: '' };
    const prevVal = parseFloat(current[field]) || 0;
    const nextVal = Math.max(0, Math.round((prevVal + delta) * 2) / 2);
    handleFieldChange(studentId, field, nextVal === 0 ? '' : String(nextVal));
  };

  const handleSave = async () => {
    if (!activeTarget || !isEditMode) return;
    setSaving(true);
    setSaveError('');
    try {
      const entries = activeStudents.map((st) => {
        const row = gridData[st.id] || { absent: '', justified: '', notes: '' };
        const absentHalfDays = Math.max(0, Math.round((parseFloat(row.absent) || 0) * 2) / 2);
        const justifiedHalfDays = Math.min(
          absentHalfDays,
          Math.max(0, Math.round((parseFloat(row.justified) || 0) * 2) / 2)
        );
        return {
          studentId: st.id,
          absentHalfDays,
          justifiedHalfDays,
          notes: row.notes.trim(),
        };
      });

      await onSaveSegmentRecords({
        schoolYear: config.school_year,
        period: activeTarget.period,
        monthKey: activeTarget.monthKey,
        startDate: activeTarget.startDate,
        endDate: activeTarget.endDate,
        headcount: activeCount,
        segmentKey: activeTarget.segmentKey,
        entries,
      });

      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2200);
    } catch (err: any) {
      setSaveError(err?.message || 'Erreur lors de la sauvegarde des absences.');
    } finally {
      setSaving(false);
    }
  };

  if (!activeTarget) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-8 text-center space-y-3">
        <p className="text-sm font-semibold text-slate-700">
          Aucune période de classe valide n’est configurée pour {config.school_year}.
        </p>
        <button
          type="button"
          onClick={onOpenSettings}
          className="px-4 py-2 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition"
        >
          Configurer les périodes scolaires
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Barre supérieure de sélection */}
      <div className="p-4 bg-slate-50 border-b border-slate-200 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <h3 className="font-bold text-slate-800 text-sm">
              Saisie des absences — {activeTarget.label}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
              Du {formatDateFr(activeTarget.startDate)} au {formatDateFr(activeTarget.endDate)} ·{' '}
              {activeTarget.workingDays} jours ouvrés ({activeTarget.workingHalfDays} demi-journées) ·{' '}
              Rythme {config.week_days} j/sem.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg">
              <button
                type="button"
                onClick={() => setEntryMode('monthly')}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition whitespace-nowrap shrink-0 ${
                  entryMode === 'monthly'
                    ? 'bg-white text-indigo-700 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Par mois
              </button>
              <button
                type="button"
                onClick={() => setEntryMode('period')}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition whitespace-nowrap shrink-0 ${
                  entryMode === 'period'
                    ? 'bg-white text-indigo-700 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Global période
              </button>
            </div>

            {entryMode === 'monthly' ? (
              <select
                value={activeTarget.segmentKey}
                onChange={(e) => setSelectedSegmentKey(e.target.value)}
                className="px-3 py-1.5 text-xs font-semibold border border-slate-300 rounded-lg bg-white text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none"
              >
                {segments.map((seg) => (
                  <option key={seg.key} value={seg.key}>
                    {seg.monthLabel} · {seg.periodLabel} ({seg.workingHalfDays} ½j)
                  </option>
                ))}
              </select>
            ) : (
              <select
                value={selectedPeriodNum}
                onChange={(e) => setSelectedPeriodNum(Number(e.target.value))}
                className="px-3 py-1.5 text-xs font-semibold border border-slate-300 rounded-lg bg-white text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none"
              >
                {config.periods.map((p) => (
                  <option key={p.period} value={p.period}>
                    {p.label || `Période ${p.period}`}
                  </option>
                ))}
              </select>
            )}

            <button
              type="button"
              onClick={onOpenSettings}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg border border-indigo-200 transition whitespace-nowrap shrink-0"
            >
              <CalendarRange className="w-3.5 h-3.5" />
              Calendrier & Périodes
            </button>

            {isEditMode && (
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-sm transition disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                <Save className="w-3.5 h-3.5" />
                {saving ? 'Enregistrement...' : 'Enregistrer'}
              </button>
            )}
          </div>
        </div>

        {/* Bandeau métriques en direct + filtres */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-200/80">
          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600 tabular-nums">
            <span>
              Élèves actifs : <strong className="text-slate-900">{activeCount}</strong>
            </span>
            <span className="text-slate-300">·</span>
            <span>
              Présences possibles : <strong className="text-slate-900">{liveTotals.possiblePresences}</strong> ½j
            </span>
            <span className="text-slate-300">·</span>
            <span>
              Absences saisies : <strong className="text-slate-900">{liveTotals.totalAbsent}</strong> ½j
              {liveTotals.totalJustified > 0 && ` (dont ${liveTotals.totalJustified} justifiées)`}
            </span>
            <span className="text-slate-300">·</span>
            <span>
              Taux calculé :{' '}
              <strong
                className={
                  liveTotals.rate >= 10
                    ? 'text-rose-700'
                    : liveTotals.rate >= 5
                      ? 'text-amber-700'
                      : 'text-emerald-700'
                }
              >
                {liveTotals.rate.toFixed(2).replace('.', ',')} %
              </strong>
            </span>
          </div>

          <div className="flex items-center gap-2">
            {uniqueGrades.length > 1 && (
              <select
                value={selectedGrade}
                onChange={(e) => setSelectedGrade(e.target.value)}
                className="px-2.5 py-1.5 text-xs font-semibold border border-slate-300 rounded-lg bg-white text-slate-700 outline-none"
              >
                <option value="all">Tous niveaux</option>
                {uniqueGrades.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            )}

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filtrer un élève..."
                className="pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none w-44"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Bandeau Mode Lecture */}
      {!isEditMode && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-800 px-4 py-2.5 text-xs font-semibold flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-amber-600 shrink-0" />
            <span>Mode consultation uniquement — déverrouillez le mode Saisie pour modifier les absences.</span>
          </div>
          {handleToggleEditMode && (
            <button
              type="button"
              onClick={handleToggleEditMode}
              className="flex items-center gap-1.5 px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-md text-xs font-semibold transition whitespace-nowrap shrink-0"
            >
              <Unlock className="w-3.5 h-3.5" />
              Déverrouiller
            </button>
          )}
        </div>
      )}

      {/* Avertissement saisie globale alors que des saisies mensuelles existent */}
      {hasMonthlyOverlapInSelectedPeriod && (
        <div className="bg-indigo-50 border-b border-indigo-200 text-indigo-800 px-4 py-2 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-indigo-600 shrink-0" />
          <span>
            Des saisies mensuelles existent déjà sur cette période : dans les bilans, les données mensuelles restent prioritaires pour éviter tout double comptage.
          </span>
        </div>
      )}

      {saveError && (
        <div className="bg-rose-50 border-b border-rose-200 text-rose-700 px-4 py-2.5 text-xs font-semibold">
          {saveError}
        </div>
      )}

      {savedSuccess && (
        <div className="bg-emerald-50 border-b border-emerald-200 text-emerald-800 px-4 py-2.5 text-xs font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          Absences et effectif enregistrés pour {activeTarget.label}.
        </div>
      )}

      {/* Tableau haute densité */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-600">
              <th className="py-2.5 px-4">Élève</th>
              <th className="py-2.5 px-3">Niveau</th>
              <th className="py-2.5 px-3 text-center">Absences (½ journées)</th>
              <th className="py-2.5 px-3 text-center">Dont justifiées</th>
              <th className="py-2.5 px-3 text-right">Non justifiées</th>
              <th className="py-2.5 px-3 text-right">Taux élève</th>
              <th className="py-2.5 px-4">Observation / Motif</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 text-sm">
            {filteredStudents.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-xs text-slate-500">
                  Aucun élève actif trouvé.
                </td>
              </tr>
            ) : (
              filteredStudents.map((st) => {
                const row = gridData[st.id] || { absent: '', justified: '', notes: '' };
                const aNum = Math.max(0, parseFloat(row.absent) || 0);
                const jNum = Math.min(aNum, Math.max(0, parseFloat(row.justified) || 0));
                const uNum = Math.max(0, Math.round((aNum - jNum) * 10) / 10);
                const studentRate =
                  activeTarget.workingHalfDays > 0
                    ? (aNum / activeTarget.workingHalfDays) * 100
                    : 0;

                const isMonthlyAlert = entryMode === 'monthly' && aNum >= 4;

                return (
                  <tr
                    key={st.id}
                    className={`transition-colors ${
                      isMonthlyAlert
                        ? 'bg-rose-50/70 hover:bg-rose-50'
                        : aNum > 0
                          ? 'bg-amber-50/20 hover:bg-slate-50/80'
                          : 'hover:bg-slate-50/80'
                    }`}
                  >
                    <td className="py-2 px-4 font-semibold text-slate-800 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span>
                          {st.lastName} {st.firstName}
                        </span>
                        {isMonthlyAlert && (
                          <span className="text-[11px] font-bold text-rose-700">
                            · Seuil ≥ 4 ½j
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2 px-3 text-xs text-slate-500 whitespace-nowrap">
                      {st.grade}
                    </td>
                    <td className="py-2 px-3">
                      <div className="flex items-center justify-center gap-1">
                        {isEditMode && (
                          <button
                            type="button"
                            onClick={() => handleStep(st.id, 'absent', -1)}
                            className="w-6 h-7 rounded border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600 font-bold text-xs transition"
                          >
                            -
                          </button>
                        )}
                        <input
                          type="number"
                          min={0}
                          max={activeTarget.workingHalfDays || 500}
                          step={0.5}
                          disabled={!isEditMode}
                          value={row.absent}
                          placeholder="0"
                          onChange={(e) => handleFieldChange(st.id, 'absent', e.target.value)}
                          className="w-16 px-2 py-1 text-center font-mono tabular-nums font-semibold border border-slate-300 rounded focus:ring-2 focus:ring-indigo-500 outline-none text-xs disabled:bg-slate-100"
                        />
                        {isEditMode && (
                          <button
                            type="button"
                            onClick={() => handleStep(st.id, 'absent', 1)}
                            className="w-6 h-7 rounded border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600 font-bold text-xs transition"
                          >
                            +
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="py-2 px-3">
                      <div className="flex items-center justify-center gap-1">
                        {isEditMode && (
                          <button
                            type="button"
                            onClick={() => handleStep(st.id, 'justified', -1)}
                            className="w-6 h-7 rounded border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600 font-bold text-xs transition"
                          >
                            -
                          </button>
                        )}
                        <input
                          type="number"
                          min={0}
                          max={aNum}
                          step={0.5}
                          disabled={!isEditMode || aNum === 0}
                          value={row.justified}
                          placeholder="0"
                          onChange={(e) => handleFieldChange(st.id, 'justified', e.target.value)}
                          className="w-16 px-2 py-1 text-center font-mono tabular-nums font-semibold border border-slate-300 rounded focus:ring-2 focus:ring-indigo-500 outline-none text-xs disabled:bg-slate-100"
                        />
                        {isEditMode && (
                          <button
                            type="button"
                            onClick={() => handleStep(st.id, 'justified', 1)}
                            disabled={aNum === 0}
                            className="w-6 h-7 rounded border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600 font-bold text-xs transition disabled:opacity-40"
                          >
                            +
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="py-2 px-3 text-right font-mono tabular-nums text-xs font-semibold text-slate-700">
                      {uNum > 0 ? (
                        <span className="text-rose-700">{uNum}</span>
                      ) : (
                        <span className="text-slate-400">0</span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-right font-mono tabular-nums text-xs font-bold">
                      <span
                        className={
                          studentRate >= 15
                            ? 'text-rose-700'
                            : studentRate >= 8
                              ? 'text-amber-700'
                              : studentRate > 0
                                ? 'text-slate-800'
                                : 'text-slate-400'
                        }
                      >
                        {studentRate.toFixed(1).replace('.', ',')} %
                      </span>
                    </td>
                    <td className="py-2 px-4">
                      <input
                        type="text"
                        disabled={!isEditMode}
                        value={row.notes}
                        onChange={(e) => handleFieldChange(st.id, 'notes', e.target.value)}
                        placeholder={isEditMode ? 'Motif ou note...' : ''}
                        className="w-full min-w-[140px] px-2.5 py-1 text-xs border border-slate-200 rounded bg-white disabled:bg-transparent disabled:border-transparent focus:ring-2 focus:ring-indigo-500 outline-none"
                      />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
