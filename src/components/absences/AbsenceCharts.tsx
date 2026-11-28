import React, { useState, useMemo, useRef } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  BarChart,
  Bar,
  Cell,
  ReferenceLine,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { Copy, Check, FileText, AlertCircle, AlertTriangle, FileDown } from 'lucide-react';
import { AbsenceConfig, Student, StudentAbsenceRecord } from '../../types';
import {
  buildPeriodMonthSegments,
  computeSegmentStats,
  computeStatsByMonth,
  computeStatsByPeriod,
  computeStatsForDateRange,
  ComputedPeriodStats,
  ComputedStudentAbsenceSummary,
  enrichStudentSummaries,
  formatAbsencesAsSummaryText,
  formatAbsencesAsTSV,
  formatDateFr,
  sortSchoolGrades,
} from '../../utils/absences';
import { exportAbsenceReportPdf } from '../../utils/absencePdfExport';

interface AbsenceChartsProps {
  students: Student[];
  config: AbsenceConfig;
  records: StudentAbsenceRecord[];
  onGoToSaisie?: () => void;
}

type ScopeMode = 'year' | 'period' | 'month' | 'range';
type YearGranularity = 'month' | 'period';
type StudentChartMode = 'monthly_peak' | 'cumulative';

const MONTHLY_ALERT_THRESHOLD = 4; // Seuil légal d'alerte : 4 demi-journées par mois

export default function AbsenceCharts({
  students,
  config,
  records,
  onGoToSaisie,
}: AbsenceChartsProps) {
  const activeStudentsAll = useMemo(() => students.filter((s) => !s.isArchived), [students]);

  const availableGrades = useMemo(
    () => sortSchoolGrades(Array.from(new Set(activeStudentsAll.map((s) => s.grade).filter(Boolean)))),
    [activeStudentsAll]
  );

  const [selectedGrade, setSelectedGrade] = useState<string>('all');
  const effectiveGrade =
    selectedGrade !== 'all' && availableGrades.includes(selectedGrade) ? selectedGrade : 'all';

  const scopedStudents = useMemo(
    () =>
      effectiveGrade === 'all'
        ? students
        : students.filter((s) => s.grade === effectiveGrade),
    [students, effectiveGrade]
  );

  const scopedActiveStudents = useMemo(
    () =>
      effectiveGrade === 'all'
        ? activeStudentsAll
        : activeStudentsAll.filter((s) => s.grade === effectiveGrade),
    [activeStudentsAll, effectiveGrade]
  );

  const activeCount = scopedActiveStudents.length;

  const scopedStudentIds = useMemo(
    () => new Set(scopedStudents.map((s) => s.id)),
    [scopedStudents]
  );

  const scopedRecords = useMemo(
    () =>
      effectiveGrade === 'all'
        ? records
        : records.filter((r) => scopedStudentIds.has(r.student_id)),
    [records, effectiveGrade, scopedStudentIds]
  );

  const scopedConfig = useMemo(
    () =>
      effectiveGrade === 'all'
        ? config
        : { ...config, segment_headcounts: {} },
    [config, effectiveGrade]
  );

  const targetGradeLabel = useMemo(() => {
    if (effectiveGrade !== 'all') return effectiveGrade;
    return availableGrades.length > 0 ? availableGrades.join(' / ') : 'Classe entière';
  }, [effectiveGrade, availableGrades]);

  const [scopeMode, setScopeMode] = useState<ScopeMode>('year');
  const [yearGranularity, setYearGranularity] = useState<YearGranularity>('month');
  const [selectedPeriod, setSelectedPeriod] = useState<number>(1);
  const [studentChartMode, setStudentChartMode] = useState<StudentChartMode>('monthly_peak');

  const monthStatsAll = useMemo(
    () => computeStatsByMonth(scopedConfig, scopedRecords, activeCount),
    [scopedConfig, scopedRecords, activeCount]
  );

  const periodStatsAll = useMemo(
    () => computeStatsByPeriod(scopedConfig, scopedRecords, activeCount),
    [scopedConfig, scopedRecords, activeCount]
  );

  const segments = useMemo(() => buildPeriodMonthSegments(scopedConfig), [scopedConfig]);

  const [selectedMonthKey, setSelectedMonthKey] = useState<string>('');
  const effectiveMonthKey = useMemo(() => {
    if (selectedMonthKey && monthStatsAll.some((m) => m.key === selectedMonthKey)) {
      return selectedMonthKey;
    }
    return monthStatsAll[0]?.key || '';
  }, [selectedMonthKey, monthStatsAll]);

  const yearBounds = useMemo(() => {
    const validPeriods = (config.periods || []).filter((p) => p.start && p.end);
    if (validPeriods.length === 0) {
      const y1 = config.school_year.split('-')[0] || '2026';
      const y2 = config.school_year.split('-')[1] || '2027';
      return { start: `${y1}-09-01`, end: `${y2}-07-06` };
    }
    const sorted = [...validPeriods].sort((a, b) => a.start.localeCompare(b.start));
    return {
      start: sorted[0].start,
      end: sorted[sorted.length - 1].end,
    };
  }, [config]);

  const [rangeFrom, setRangeFrom] = useState<string>(yearBounds.start);
  const [rangeTo, setRangeTo] = useState<string>(yearBounds.end);

  const [includeStudentDetailInCopy, setIncludeStudentDetailInCopy] = useState<boolean>(true);
  const [copiedType, setCopiedType] = useState<'tsv' | 'summary' | null>(null);
  const [exportingPdf, setExportingPdf] = useState<boolean>(false);
  const classChartRef = useRef<HTMLDivElement | null>(null);

  // Calcul unifié selon la cible sélectionnée
  const analysis = useMemo<{
    title: string;
    chartRows: ComputedPeriodStats[];
    exportRows: ComputedPeriodStats[];
    summary: ComputedPeriodStats;
    studentSummaries: ComputedStudentAbsenceSummary[];
  }>(() => {
    if (scopeMode === 'period') {
      const pConfig = (scopedConfig.periods || []).find((p) => p.period === selectedPeriod);
      const pStart = pConfig?.start || yearBounds.start;
      const pEnd = pConfig?.end || yearBounds.end;
      const pSegments = segments.filter((s) => s.period === selectedPeriod);
      const segRows = pSegments.map((seg) =>
        computeSegmentStats(seg, scopedRecords, scopedConfig, activeCount)
      );
      const periodOverview =
        periodStatsAll.find((p) => p.key === `P${selectedPeriod}`) ||
        computeStatsForDateRange(pStart, pEnd, scopedConfig, scopedRecords, activeCount).summary;

      const { studentSummaries: rawStudents } = computeStatsForDateRange(
        pStart,
        pEnd,
        scopedConfig,
        scopedRecords,
        activeCount
      );

      const chartRows = segRows.length > 0 ? segRows : [periodOverview];
      return {
        title: `${pConfig?.label || `Période ${selectedPeriod}`} (${scopedConfig.school_year})`,
        chartRows,
        exportRows: segRows.length > 0 ? segRows : [periodOverview],
        summary: periodOverview,
        studentSummaries: enrichStudentSummaries(
          rawStudents,
          scopedStudents,
          periodOverview.workingHalfDays
        ),
      };
    }

    if (scopeMode === 'month' && effectiveMonthKey) {
      const mStat = monthStatsAll.find((m) => m.key === effectiveMonthKey);
      const mSegments = segments.filter((s) => s.monthKey === effectiveMonthKey);
      const segRows = mSegments.map((seg) =>
        computeSegmentStats(seg, scopedRecords, scopedConfig, activeCount)
      );

      const mStart = mStat?.startDate || yearBounds.start;
      const mEnd = mStat?.endDate || yearBounds.end;
      const { summary: fallbackSummary, studentSummaries: rawStudents } =
        computeStatsForDateRange(mStart, mEnd, scopedConfig, scopedRecords, activeCount);

      const finalSummary = mStat || fallbackSummary;
      return {
        title: `${finalSummary.label} (${scopedConfig.school_year})`,
        chartRows: segRows.length > 0 ? segRows : [finalSummary],
        exportRows: segRows.length > 0 ? segRows : [finalSummary],
        summary: finalSummary,
        studentSummaries: enrichStudentSummaries(
          rawStudents,
          scopedStudents,
          finalSummary.workingHalfDays
        ),
      };
    }

    if (scopeMode === 'range') {
      const safeFrom = rangeFrom <= rangeTo ? rangeFrom : rangeTo;
      const safeTo = rangeFrom <= rangeTo ? rangeTo : rangeFrom;
      const { summary, studentSummaries: rawStudents } = computeStatsForDateRange(
        safeFrom,
        safeTo,
        scopedConfig,
        scopedRecords,
        activeCount
      );

      // Découpe la plage en mois pour alimenter le graphe
      const overlappingMonths = monthStatsAll
        .filter((m) => m.endDate >= safeFrom && m.startDate <= safeTo)
        .map((m) => {
          const subStart = m.startDate > safeFrom ? m.startDate : safeFrom;
          const subEnd = m.endDate < safeTo ? m.endDate : safeTo;
          const sub = computeStatsForDateRange(subStart, subEnd, scopedConfig, scopedRecords, activeCount);
          return { ...sub.summary, label: m.label };
        });

      return {
        title: `Plage du ${formatDateFr(safeFrom)} au ${formatDateFr(safeTo)}`,
        chartRows: overlappingMonths.length > 0 ? overlappingMonths : [summary],
        exportRows: overlappingMonths.length > 0 ? overlappingMonths : [summary],
        summary,
        studentSummaries: enrichStudentSummaries(rawStudents, scopedStudents, summary.workingHalfDays),
      };
    }

    // Mode 'year' : année scolaire complète
    const { summary, studentSummaries: rawStudents } = computeStatsForDateRange(
      yearBounds.start,
      yearBounds.end,
      scopedConfig,
      scopedRecords,
      activeCount
    );
    const rows = yearGranularity === 'period' ? periodStatsAll : monthStatsAll;

    return {
      title: `Année scolaire ${scopedConfig.school_year}`,
      chartRows: rows,
      exportRows: rows,
      summary: {
        ...summary,
        label: `Année ${scopedConfig.school_year}`,
      },
      studentSummaries: enrichStudentSummaries(rawStudents, scopedStudents, summary.workingHalfDays),
    };
  }, [
    scopeMode,
    yearGranularity,
    selectedPeriod,
    effectiveMonthKey,
    rangeFrom,
    rangeTo,
    scopedConfig,
    scopedRecords,
    activeCount,
    segments,
    monthStatsAll,
    periodStatsAll,
    yearBounds,
    scopedStudents,
  ]);

  const chartData = useMemo(
    () =>
      analysis.chartRows.map((row) => ({
        name: row.label.replace(/\s*\d{4}$/, ''),
        absencesJustifiees: row.justifiedHalfDays,
        absencesNonJustifiees: row.unjustifiedHalfDays,
        taux: row.absenceRate,
        presencesPossibles: row.possiblePresences,
      })),
    [analysis.chartRows]
  );

  // Calcul du pic mensuel par élève (pour détecter le seuil d'alerte de 4 ½j / mois)
  const studentMonthlyAlerts = useMemo(() => {
    const start = analysis.summary.startDate;
    const end = analysis.summary.endDate;

    // Regrouper par élève puis par mois civil YYYY-MM sur la plage sélectionnée
    const byStudentMonth = new Map<
      string,
      Map<string, { absent: number; justified: number; unjustified: number }>
    >();

    scopedRecords
      .filter(
        (r) =>
          r.school_year === config.school_year &&
          r.month_key !== 'ALL' &&
          r.end_date >= start &&
          r.start_date <= end
      )
      .forEach((r) => {
        let mMap = byStudentMonth.get(r.student_id);
        if (!mMap) {
          mMap = new Map();
          byStudentMonth.set(r.student_id, mMap);
        }
        const prev = mMap.get(r.month_key) || { absent: 0, justified: 0, unjustified: 0 };
        const a = Number(r.absent_half_days) || 0;
        const j = Number(r.justified_half_days) || 0;
        const u = Math.max(0, a - j);
        mMap.set(r.month_key, {
          absent: prev.absent + a,
          justified: prev.justified + j,
          unjustified: prev.unjustified + u,
        });
      });

    const result = new Map<
      string,
      {
        maxMonthAbsent: number;
        maxMonthJustified: number;
        maxMonthUnjustified: number;
        maxMonthKey: string;
        alertMonthsCount: number;
        isAlert: boolean;
      }
    >();

    byStudentMonth.forEach((mMap, studentId) => {
      let maxAbsent = 0;
      let maxJustified = 0;
      let maxUnjustified = 0;
      let maxMonthKey = '';
      let alertMonthsCount = 0;

      mMap.forEach((vals, mKey) => {
        if (vals.absent >= MONTHLY_ALERT_THRESHOLD) {
          alertMonthsCount += 1;
        }
        if (vals.absent > maxAbsent) {
          maxAbsent = vals.absent;
          maxJustified = vals.justified;
          maxUnjustified = vals.unjustified;
          maxMonthKey = mKey;
        }
      });

      result.set(studentId, {
        maxMonthAbsent: Math.round(maxAbsent * 10) / 10,
        maxMonthJustified: Math.round(maxJustified * 10) / 10,
        maxMonthUnjustified: Math.round(maxUnjustified * 10) / 10,
        maxMonthKey,
        alertMonthsCount,
        isAlert: maxAbsent >= MONTHLY_ALERT_THRESHOLD,
      });
    });

    return result;
  }, [records, config.school_year, analysis.summary.startDate, analysis.summary.endDate]);

  const alertStudentsCount = useMemo(
    () =>
      analysis.studentSummaries.filter(
        (s) => studentMonthlyAlerts.get(s.studentId)?.isAlert
      ).length,
    [analysis.studentSummaries, studentMonthlyAlerts]
  );

  const studentChartData = useMemo(() => {
    const useMonthlyValues = scopeMode === 'month' || studentChartMode === 'monthly_peak';

    return analysis.studentSummaries
      .map((s) => {
        const alertInfo = studentMonthlyAlerts.get(s.studentId);
        const justifiees = useMonthlyValues
          ? alertInfo?.maxMonthJustified ?? s.justifiedHalfDays
          : s.justifiedHalfDays;
        const nonJustifiees = useMonthlyValues
          ? alertInfo?.maxMonthUnjustified ?? s.unjustifiedHalfDays
          : s.unjustifiedHalfDays;
        const total = Math.round((justifiees + nonJustifiees) * 10) / 10;
        const isAlert = useMonthlyValues
          ? total >= MONTHLY_ALERT_THRESHOLD
          : Boolean(alertInfo?.isAlert);

        return {
          studentId: s.studentId,
          name: `${s.firstName} ${s.lastName.charAt(0)}.`,
          justifiees,
          nonJustifiees,
          total,
          taux: s.absenceRate,
          isAlert,
          peakMonth: alertInfo?.maxMonthKey || '',
        };
      })
      .filter((item) => item.total > 0)
      .sort((a, b) => b.total - a.total)
      .slice(0, 12);
  }, [analysis.studentSummaries, studentMonthlyAlerts, scopeMode, studentChartMode]);

  const handleCopyTSV = async () => {
    const tsv = formatAbsencesAsTSV(
      analysis.title,
      analysis.exportRows,
      includeStudentDetailInCopy ? analysis.studentSummaries : undefined
    );
    try {
      await navigator.clipboard.writeText(tsv);
      setCopiedType('tsv');
      setTimeout(() => setCopiedType(null), 2000);
    } catch (err) {
      console.error('Erreur copie presse-papiers:', err);
    }
  };

  const handleCopySummary = async () => {
    const txt = formatAbsencesAsSummaryText(analysis.title, analysis.summary);
    try {
      await navigator.clipboard.writeText(txt);
      setCopiedType('summary');
      setTimeout(() => setCopiedType(null), 2000);
    } catch (err) {
      console.error('Erreur copie synthèse:', err);
    }
  };

  const alertStudentIds = useMemo(() => {
    const ids = new Set<string>();
    studentMonthlyAlerts.forEach((val, id) => {
      if (val.isAlert) ids.add(id);
    });
    return ids;
  }, [studentMonthlyAlerts]);

  const handleExportPdf = async () => {
    setExportingPdf(true);
    try {
      await exportAbsenceReportPdf({
        title: analysis.title,
        schoolYear: config.school_year,
        gradeLabel: targetGradeLabel,
        teacherName: config.teacher_name || 'Julie Carnis-Bréart',
        summary: analysis.summary,
        rows: analysis.exportRows,
        studentRows: analysis.studentSummaries,
        alertStudentIds,
        includeStudentDetail: includeStudentDetailInCopy,
        chartContainerEl: classChartRef.current,
      });
    } catch (err) {
      console.error('Erreur export PDF:', err);
    } finally {
      setExportingPdf(false);
    }
  };

  const yearRecordsExist = useMemo(
    () => scopedRecords.some((r) => r.school_year === config.school_year && r.absent_half_days > 0),
    [scopedRecords, config.school_year]
  );

  return (
    <div className="space-y-6">
      {/* Barre de sélection de cible & boutons Copier-Coller */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-4">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg border border-slate-200">
              <button
                type="button"
                onClick={() => setScopeMode('year')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition whitespace-nowrap shrink-0 ${
                  scopeMode === 'year'
                    ? 'bg-white text-indigo-700 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Année complète
              </button>
              <button
                type="button"
                onClick={() => setScopeMode('period')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition whitespace-nowrap shrink-0 ${
                  scopeMode === 'period'
                    ? 'bg-white text-indigo-700 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Par période (P1–P5)
              </button>
              <button
                type="button"
                onClick={() => setScopeMode('month')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition whitespace-nowrap shrink-0 ${
                  scopeMode === 'month'
                    ? 'bg-white text-indigo-700 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Mois par mois
              </button>
              <button
                type="button"
                onClick={() => setScopeMode('range')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition whitespace-nowrap shrink-0 ${
                  scopeMode === 'range'
                    ? 'bg-white text-indigo-700 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                De date à date
              </button>
            </div>

            {scopeMode === 'year' && (
              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg border border-slate-200">
                <button
                  type="button"
                  onClick={() => setYearGranularity('month')}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-md transition whitespace-nowrap shrink-0 ${
                    yearGranularity === 'month'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Vue mensuelle
                </button>
                <button
                  type="button"
                  onClick={() => setYearGranularity('period')}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-md transition whitespace-nowrap shrink-0 ${
                    yearGranularity === 'period'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Vue P1–P5
                </button>
              </div>
            )}

            {scopeMode === 'period' && (
              <div className="flex items-center bg-slate-100 p-1 rounded-lg border border-slate-200">
                {[1, 2, 3, 4, 5].map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setSelectedPeriod(p)}
                    className={`px-3 py-1 text-xs font-bold rounded-md transition ${
                      selectedPeriod === p
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    P{p}
                  </button>
                ))}
              </div>
            )}

            {scopeMode === 'month' && (
              <select
                value={effectiveMonthKey}
                onChange={(e) => setSelectedMonthKey(e.target.value)}
                className="px-3 py-1.5 text-xs font-semibold border border-slate-300 rounded-lg bg-white text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none"
              >
                {monthStatsAll.map((m) => (
                  <option key={m.key} value={m.key}>
                    {m.label} ({m.workingHalfDays} ½j)
                  </option>
                ))}
              </select>
            )}

            {scopeMode === 'range' && (
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-slate-500 font-medium">Du</span>
                <input
                  type="date"
                  value={rangeFrom}
                  onChange={(e) => setRangeFrom(e.target.value)}
                  className="px-2.5 py-1.5 border border-slate-300 rounded-lg tabular-nums text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none"
                />
                <span className="text-slate-500 font-medium">au</span>
                <input
                  type="date"
                  value={rangeTo}
                  onChange={(e) => setRangeTo(e.target.value)}
                  className="px-2.5 py-1.5 border border-slate-300 rounded-lg tabular-nums text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
            )}

            {availableGrades.length > 1 && (
              <select
                value={effectiveGrade}
                onChange={(e) => setSelectedGrade(e.target.value)}
                className="px-3 py-1.5 text-xs font-semibold border border-slate-300 rounded-lg bg-white text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none"
                title="Niveau ciblé pour les graphiques et l’export PDF"
              >
                <option value="all">Tous niveaux ({availableGrades.join(' / ')})</option>
                {availableGrades.map((g) => (
                  <option key={g} value={g}>
                    Niveau {g}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Actions Copier-Coller */}
          <div className="flex flex-wrap items-center gap-2.5">
            <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={includeStudentDetailInCopy}
                onChange={(e) => setIncludeStudentDetailInCopy(e.target.checked)}
                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span>Inclure détail élèves</span>
            </label>

            <button
              type="button"
              onClick={handleCopyTSV}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-sm transition whitespace-nowrap shrink-0"
            >
              {copiedType === 'tsv' ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  Tableau copié !
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  Copier pour tableur
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleCopySummary}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 rounded-lg text-xs font-semibold transition whitespace-nowrap shrink-0"
            >
              {copiedType === 'summary' ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  Synthèse copiée !
                </>
              ) : (
                <>
                  <FileText className="w-3.5 h-3.5 text-slate-600" />
                  Copier synthèse
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleExportPdf}
              disabled={exportingPdf}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold shadow-sm transition disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <FileDown className="w-3.5 h-3.5" />
              {exportingPdf ? 'Génération PDF...' : 'Exporter PDF'}
            </button>
          </div>
        </div>

        {analysis.summary.isProrated && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 px-3 py-2 rounded-lg text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              La plage sélectionnée coupe un mois saisi en cours : les absences de ce mois ont été proratisées selon les demi-journées ouvrées de l’intervalle.
            </span>
          </div>
        )}
      </div>

      {/* Bandeau 4 KPI (single-level elevation, tabular-nums) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-xs font-semibold text-slate-500">Jours de classe ouvrés</div>
          <div className="mt-1.5 flex items-baseline gap-2 font-mono tabular-nums">
            <span className="text-2xl font-bold text-slate-900">
              {analysis.summary.workingDays}
            </span>
            <span className="text-xs text-slate-500">
              jours ({analysis.summary.workingHalfDays} ½j)
            </span>
          </div>
          <div className="mt-1 text-xs text-slate-500 tabular-nums">
            {formatDateFr(analysis.summary.startDate)} – {formatDateFr(analysis.summary.endDate)}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-xs font-semibold text-slate-500">Présences possibles</div>
          <div className="mt-1.5 flex items-baseline gap-2 font-mono tabular-nums">
            <span className="text-2xl font-bold text-slate-900">
              {analysis.summary.possiblePresences}
            </span>
            <span className="text-xs text-slate-500">demi-journées</span>
          </div>
          <div className="mt-1 text-xs text-slate-500 tabular-nums">
            Effectif moyen : {String(analysis.summary.headcount).replace('.', ',')} élèves
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-xs font-semibold text-slate-500">Absences enregistrées</div>
          <div className="mt-1.5 flex items-baseline gap-2 font-mono tabular-nums">
            <span className="text-2xl font-bold text-slate-900">
              {String(analysis.summary.absentHalfDays).replace('.', ',')}
            </span>
            <span className="text-xs text-slate-500">demi-journées</span>
          </div>
          <div className="mt-1 text-xs text-slate-500 tabular-nums">
            {String(analysis.summary.justifiedHalfDays).replace('.', ',')} justifiées ·{' '}
            {String(analysis.summary.unjustifiedHalfDays).replace('.', ',')} non justifiées
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-xs font-semibold text-slate-500">Taux d’absence</div>
          <div className="mt-1.5 flex items-baseline gap-2 font-mono tabular-nums">
            <span
              className={`text-2xl font-bold ${
                analysis.summary.absenceRate >= 10
                  ? 'text-rose-700'
                  : analysis.summary.absenceRate >= 5
                    ? 'text-amber-700'
                    : 'text-emerald-700'
              }`}
            >
              {analysis.summary.absenceRate.toFixed(2).replace('.', ',')} %
            </span>
          </div>
          <div className="mt-1 text-xs text-slate-500">
            (Absences ÷ Présences possibles) × 100
          </div>
        </div>
      </div>

      {/* État vide si aucune absence encore enregistrée */}
      {!yearRecordsExist && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h4 className="text-sm font-bold text-slate-800">
              Aucune absence saisie pour {config.school_year}
            </h4>
            <p className="text-xs text-slate-500 mt-1">
              Les jours ouvrés et présences possibles sont déjà calculés. Saisissez les premières absences en fin de mois ou de période pour alimenter les graphiques.
            </p>
          </div>
          {onGoToSaisie && (
            <button
              type="button"
              onClick={onGoToSaisie}
              className="px-4 py-2 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg shadow-sm transition whitespace-nowrap shrink-0"
            >
              Saisir des absences
            </button>
          )}
        </div>
      )}

      {/* Graphique d'évolution + Tableau de synthèse */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <div className="xl:col-span-7 bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-slate-800">
                Évolution du taux d’absence et volume (½ journées)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">{analysis.title}</p>
            </div>
          </div>

          <div ref={classChartRef} className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 10, right: 16, left: 0, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#475569' }} />
                <YAxis
                  yAxisId="left"
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: '#475569' }}
                  label={{
                    value: '½ journées',
                    angle: -90,
                    position: 'insideLeft',
                    style: { fontSize: 11, fill: '#64748B' },
                  }}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fontSize: 11, fill: '#4F46E5' }}
                  unit="%"
                />
                <Tooltip
                  formatter={(value: any, name: any) => {
                    if (name === "Taux d'absence (%)") {
                      return [`${Number(value).toFixed(2).replace('.', ',')} %`, name];
                    }
                    return [`${value} ½j`, name];
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Bar
                  yAxisId="left"
                  dataKey="absencesJustifiees"
                  name="Justifiées (½j)"
                  stackId="abs"
                  fill="#94A3B8"
                  radius={[0, 0, 0, 0]}
                />
                <Bar
                  yAxisId="left"
                  dataKey="absencesNonJustifiees"
                  name="Non justifiées (½j)"
                  stackId="abs"
                  fill="#F59E0B"
                  radius={[4, 4, 0, 0]}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="taux"
                  name="Taux d'absence (%)"
                  stroke="#4F46E5"
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: '#4F46E5' }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Détail & Graphique par élève sur la sélection */}
        <div className="xl:col-span-5 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-slate-800">Graphique & suivi par élève</h3>
              <p className="text-xs text-slate-500 mt-0.5 flex flex-wrap items-center gap-2">
                <span>Seuil d’alerte : 4 ½j / mois</span>
                {alertStudentsCount > 0 && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="inline-flex items-center gap-1 font-bold text-rose-700">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      {alertStudentsCount} élève{alertStudentsCount > 1 ? 's' : ''} en alerte
                    </span>
                  </>
                )}
              </p>
            </div>

            {scopeMode !== 'month' && (
              <div className="flex items-center gap-1 p-0.5 bg-slate-200/70 rounded-lg self-start sm:self-auto">
                <button
                  type="button"
                  onClick={() => setStudentChartMode('monthly_peak')}
                  className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition whitespace-nowrap ${
                    studentChartMode === 'monthly_peak'
                      ? 'bg-white text-indigo-700 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Pic mensuel
                </button>
                <button
                  type="button"
                  onClick={() => setStudentChartMode('cumulative')}
                  className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition whitespace-nowrap ${
                    studentChartMode === 'cumulative'
                      ? 'bg-white text-indigo-700 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Cumul total
                </button>
              </div>
            )}
          </div>

          <div className="p-4 border-b border-slate-200">
            {studentChartData.length > 0 ? (
              <>
                <div className="h-52 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={studentChartData}
                      layout="vertical"
                      margin={{ top: 14, right: 20, left: 8, bottom: 4 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                      <XAxis
                        type="number"
                        allowDecimals={false}
                        domain={[0, (dataMax: number) => Math.max(5, Math.ceil(dataMax))]}
                        tick={{ fontSize: 10, fill: '#475569' }}
                      />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={86}
                        tick={{ fontSize: 10, fill: '#334155' }}
                      />
                      <Tooltip
                        formatter={(value: any, name: any) => [`${value} ½j`, name]}
                        labelFormatter={(label: any, payload: any) => {
                          const item = payload?.[0]?.payload;
                          if (!item) return label;
                          const monthTag = item.peakMonth && (scopeMode !== 'month' && studentChartMode === 'monthly_peak')
                            ? ` (pic ${item.peakMonth})`
                            : '';
                          return `${label}${monthTag} — Total : ${item.total} ½j${item.isAlert ? ' · Seuil ≥ 4 ½j atteint' : ''}`;
                        }}
                      />
                      {(scopeMode === 'month' || studentChartMode === 'monthly_peak') && (
                        <ReferenceLine
                          x={MONTHLY_ALERT_THRESHOLD}
                          stroke="#DC2626"
                          strokeWidth={2}
                          strokeDasharray="4 4"
                          label={{
                            value: 'Seuil 4 ½j',
                            position: 'top',
                            fill: '#DC2626',
                            fontSize: 10,
                            fontWeight: 700,
                          }}
                        />
                      )}
                      <Bar dataKey="justifiees" name="Justifiées (½j)" stackId="s">
                        {studentChartData.map((entry) => (
                          <Cell
                            key={`j-${entry.studentId}`}
                            fill={entry.isAlert ? '#FB7185' : '#94A3B8'}
                          />
                        ))}
                      </Bar>
                      <Bar
                        dataKey="nonJustifiees"
                        name="Non justifiées (½j)"
                        stackId="s"
                        radius={[0, 4, 4, 0]}
                      >
                        {studentChartData.map((entry) => (
                          <Cell
                            key={`nj-${entry.studentId}`}
                            fill={entry.isAlert ? '#DC2626' : '#F59E0B'}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm bg-rose-600 inline-block" />
                    Alerte (≥ 4 ½j / mois)
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm bg-amber-500 inline-block" />
                    Sous le seuil (&lt; 4 ½j)
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm bg-slate-400 inline-block" />
                    Justifiées
                  </span>
                </div>
              </>
            ) : (
              <div className="py-6 text-center text-xs text-slate-400">
                Aucune absence enregistrée sur la sélection · La ligne d’alerte à 4 ½j/mois apparaîtra dès la première saisie.
              </div>
            )}
          </div>

          <div className="overflow-y-auto max-h-72">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/70 border-b border-slate-200 text-xs font-bold text-slate-600 sticky top-0">
                  <th className="py-2 px-4">Élève</th>
                  <th className="py-2 px-3 text-right">Abs. (½j)</th>
                  <th className="py-2 px-3 text-right">Just.</th>
                  <th className="py-2 px-4 text-right">Taux</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {analysis.studentSummaries.map((st) => {
                  const alertInfo = studentMonthlyAlerts.get(st.studentId);
                  const isAlert = Boolean(alertInfo?.isAlert);
                  return (
                    <tr
                      key={st.studentId}
                      className={isAlert ? 'bg-rose-50/60 hover:bg-rose-50' : 'hover:bg-slate-50'}
                    >
                      <td className="py-2 px-4 font-semibold text-slate-800">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span>
                            {st.lastName} {st.firstName}
                          </span>
                          <span className="text-slate-400 font-normal">({st.grade})</span>
                          {isAlert && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-700">
                              <AlertTriangle className="w-3 h-3 shrink-0" />
                              Seuil ≥ 4 ½j
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums font-semibold text-slate-800">
                        {String(st.absentHalfDays).replace('.', ',')}
                      </td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-500">
                        {String(st.justifiedHalfDays).replace('.', ',')}
                      </td>
                      <td className="py-2 px-4 text-right font-mono tabular-nums font-bold">
                        <span
                          className={
                            isAlert || st.absenceRate >= 15
                              ? 'text-rose-700'
                              : st.absenceRate >= 8
                                ? 'text-amber-700'
                                : st.absenceRate > 0
                                  ? 'text-slate-800'
                                  : 'text-slate-400'
                          }
                        >
                          {st.absenceRate.toFixed(1).replace('.', ',')} %
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Tableau détaillé des tranches */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-800">
            Tableau détaillé — {analysis.title}
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-600">
                <th className="py-2.5 px-4">Mois / Période</th>
                <th className="py-2.5 px-3">Dates</th>
                <th className="py-2.5 px-3 text-right">Jours ouvrés</th>
                <th className="py-2.5 px-3 text-right">Effectif</th>
                <th className="py-2.5 px-3 text-right">Présences possibles</th>
                <th className="py-2.5 px-3 text-right">Absences (½j)</th>
                <th className="py-2.5 px-3 text-right">Justifiées</th>
                <th className="py-2.5 px-3 text-right">Non justifiées</th>
                <th className="py-2.5 px-4 text-right">Taux (%)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-xs">
              {analysis.exportRows.map((row) => (
                <tr key={row.key} className="hover:bg-slate-50/70">
                  <td className="py-2.5 px-4 font-semibold text-slate-800 whitespace-nowrap">
                    {row.label}
                  </td>
                  <td className="py-2.5 px-3 font-mono tabular-nums text-slate-500 whitespace-nowrap">
                    {formatDateFr(row.startDate)} – {formatDateFr(row.endDate)}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700">
                    {row.workingDays} j ({row.workingHalfDays} ½j)
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700">
                    {String(row.headcount).replace('.', ',')}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700">
                    {row.possiblePresences}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-slate-900">
                    {String(row.absentHalfDays).replace('.', ',')}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-600">
                    {String(row.justifiedHalfDays).replace('.', ',')}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums text-rose-700">
                    {String(row.unjustifiedHalfDays).replace('.', ',')}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums font-bold text-indigo-700">
                    {row.absenceRate.toFixed(2).replace('.', ',')} %
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
