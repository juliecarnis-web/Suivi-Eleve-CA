import {
  addDays,
  eachDayOfInterval,
  endOfMonth,
  format,
  getDay,
  isValid,
  parseISO,
  startOfMonth,
} from 'date-fns';
import { fr } from 'date-fns/locale';
import {
  AbsenceClosure,
  AbsenceConfig,
  AbsencePeriodConfig,
  Student,
  StudentAbsenceRecord,
} from '../types';

export interface PublicHolidayItem {
  date: string; // YYYY-MM-DD
  label: string;
}

export interface WorkingHalfDaysResult {
  workingDays: number;
  workingHalfDays: number;
  autoHolidaysHit: PublicHolidayItem[];
  closureHalfDays: number;
  vacationDaysSkipped: number;
}

export interface PeriodMonthSegment {
  key: string; // e.g. '2026-09_P1'
  period: number;
  periodLabel: string;
  monthKey: string; // 'YYYY-MM'
  monthLabel: string; // 'Septembre 2026'
  shortLabel: string; // 'Sept. (P1)'
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  workingDays: number;
  workingHalfDays: number;
}

export interface ComputedPeriodStats {
  key: string;
  label: string;
  startDate: string;
  endDate: string;
  workingDays: number;
  workingHalfDays: number;
  headcount: number;
  possiblePresences: number;
  absentHalfDays: number;
  justifiedHalfDays: number;
  unjustifiedHalfDays: number;
  absenceRate: number; // %
  hasData: boolean;
  isProrated?: boolean;
}

export interface ComputedStudentAbsenceSummary {
  studentId: string;
  firstName: string;
  lastName: string;
  grade: string;
  absentHalfDays: number;
  justifiedHalfDays: number;
  unjustifiedHalfDays: number;
  possibleHalfDays: number;
  absenceRate: number; // %
}

/**
 * Retourne l'année scolaire courante au format 'YYYY-YYYY' (bascule en août).
 */
export function getDefaultSchoolYear(refDate: Date = new Date()): string {
  const year = refDate.getFullYear();
  const month = refDate.getMonth(); // 0 = Janvier, 7 = Août
  return month >= 7 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
}

/**
 * Retourne les 5 périodes scolaires par défaut pour une année 'YYYY-YYYY'.
 */
export function getDefaultPeriods(schoolYear: string): AbsencePeriodConfig[] {
  const [startYearStr, endYearStr] = schoolYear.split('-');
  const y1 = parseInt(startYearStr, 10) || new Date().getFullYear();
  const y2 = parseInt(endYearStr, 10) || y1 + 1;

  return [
    { period: 1, label: 'Période 1', start: `${y1}-09-01`, end: `${y1}-10-16` },
    { period: 2, label: 'Période 2', start: `${y1}-11-02`, end: `${y1}-12-18` },
    { period: 3, label: 'Période 3', start: `${y2}-01-04`, end: `${y2}-02-19` },
    { period: 4, label: 'Période 4', start: `${y2}-03-08`, end: `${y2}-04-16` },
    { period: 5, label: 'Période 5', start: `${y2}-05-03`, end: `${y2}-07-06` },
  ];
}

export function createDefaultAbsenceConfig(schoolYear: string): AbsenceConfig {
  return {
    school_year: schoolYear,
    teacher_name: 'Julie Carnis-Bréart',
    week_days: 4,
    half_day_slot: 'wednesday_am',
    periods: getDefaultPeriods(schoolYear),
    custom_closures: [],
    excluded_auto_holidays: [],
    segment_headcounts: {},
  };
}

const GRADE_ORDER = ['TPS', 'PS', 'MS', 'GS', 'CP', 'CE1', 'CE2', 'CM1', 'CM2'];

export function sortSchoolGrades(grades: string[]): string[] {
  return [...grades].sort((a, b) => {
    const ia = GRADE_ORDER.indexOf(a.toUpperCase());
    const ib = GRADE_ORDER.indexOf(b.toUpperCase());
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a.localeCompare(b);
  });
}

/**
 * Lecture seule : tente d'extraire des bornes de périodes depuis `user_settings.periods`
 * pour pré-remplir le module Absences sans jamais modifier `user_settings`.
 */
export function extractPeriodsFromUserSettings(
  userSettings: any,
  schoolYear: string
): AbsencePeriodConfig[] | null {
  if (!userSettings || !Array.isArray(userSettings.periods) || userSettings.periods.length === 0) {
    return null;
  }

  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  const extracted: AbsencePeriodConfig[] = [];

  userSettings.periods.slice(0, 5).forEach((raw: any, idx: number) => {
    if (!raw || typeof raw !== 'object') return;
    const rawStart = raw.start || raw.startDate || raw.start_date || raw.debut || '';
    const rawEnd = raw.end || raw.endDate || raw.end_date || raw.fin || '';
    const start = typeof rawStart === 'string' ? rawStart.slice(0, 10) : '';
    const end = typeof rawEnd === 'string' ? rawEnd.slice(0, 10) : '';
    if (dateRegex.test(start) && dateRegex.test(end) && start <= end) {
      extracted.push({
        period: idx + 1,
        label:
          typeof raw.label === 'string' && raw.label.trim()
            ? raw.label.trim()
            : typeof raw.name === 'string' && raw.name.trim()
              ? raw.name.trim()
              : `Période ${idx + 1}`,
        start,
        end,
      });
    }
  });

  if (extracted.length === 0) return null;

  // Complète jusqu'à 5 périodes si user_settings en avait moins
  const fallback = getDefaultPeriods(schoolYear);
  return fallback.map((def, idx) => extracted[idx] || def);
}

/**
 * Algorithme de Meeus/Jones/Butcher pour calculer le dimanche de Pâques (calendrier grégorien).
 */
export function getEasterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3=Mars, 4=Avril
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

/**
 * Jours fériés légaux en France métropolitaine pour une année civile.
 */
export function getFrenchPublicHolidays(year: number): PublicHolidayItem[] {
  const easter = getEasterSunday(year);
  const easterMonday = addDays(easter, 1);
  const ascension = addDays(easter, 39);
  const pentecostMonday = addDays(easter, 50);

  const items: PublicHolidayItem[] = [
    { date: `${year}-01-01`, label: 'Jour de l’an' },
    { date: format(easterMonday, 'yyyy-MM-dd'), label: 'Lundi de Pâques' },
    { date: `${year}-05-01`, label: 'Fête du Travail' },
    { date: `${year}-05-08`, label: 'Victoire 1945' },
    { date: format(ascension, 'yyyy-MM-dd'), label: 'Jeudi de l’Ascension' },
    { date: format(pentecostMonday, 'yyyy-MM-dd'), label: 'Lundi de Pentecôte' },
    { date: `${year}-07-14`, label: 'Fête nationale' },
    { date: `${year}-08-15`, label: 'Assomption' },
    { date: `${year}-11-01`, label: 'Toussaint' },
    { date: `${year}-11-11`, label: 'Armistice 1918' },
    { date: `${year}-12-25`, label: 'Noël' },
  ];

  return items.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Liste des jours fériés automatiques couvrant une année scolaire 'YYYY-YYYY' (sept. -> août).
 */
export function getSchoolYearPublicHolidays(schoolYear: string): PublicHolidayItem[] {
  const [y1Str, y2Str] = schoolYear.split('-');
  const y1 = parseInt(y1Str, 10) || new Date().getFullYear();
  const y2 = parseInt(y2Str, 10) || y1 + 1;

  const firstHalf = getFrenchPublicHolidays(y1).filter((h) => h.date >= `${y1}-08-01`);
  const secondHalf = getFrenchPublicHolidays(y2).filter((h) => h.date <= `${y2}-08-31`);

  return [...firstHalf, ...secondHalf].sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Vérifie si une date 'YYYY-MM-DD' est incluse dans l'une des périodes de classe.
 */
function isDateInSchoolPeriods(dateStr: string, periods: AbsencePeriodConfig[]): boolean {
  return periods.some((p) => p.start && p.end && dateStr >= p.start && dateStr <= p.end);
}

/**
 * Calcule les jours et demi-journées effectivement travaillés sur [startDate, endDate]
 * selon les périodes de classe, le rythme 4 ou 4,5 jours, les jours fériés auto et les fermetures manuelles.
 */
export function countWorkingHalfDays(
  startDate: string,
  endDate: string,
  config: AbsenceConfig
): WorkingHalfDaysResult {
  if (!startDate || !endDate || startDate > endDate) {
    return {
      workingDays: 0,
      workingHalfDays: 0,
      autoHolidaysHit: [],
      closureHalfDays: 0,
      vacationDaysSkipped: 0,
    };
  }

  const start = parseISO(startDate);
  const end = parseISO(endDate);
  if (!isValid(start) || !isValid(end)) {
    return {
      workingDays: 0,
      workingHalfDays: 0,
      autoHolidaysHit: [],
      closureHalfDays: 0,
      vacationDaysSkipped: 0,
    };
  }

  const excludedSet = new Set(config.excluded_auto_holidays || []);
  const autoHolidaysMap = new Map<string, string>();
  getSchoolYearPublicHolidays(config.school_year).forEach((h) => {
    if (!excludedSet.has(h.date)) {
      autoHolidaysMap.set(h.date, h.label);
    }
  });

  const closuresByDate = new Map<string, AbsenceClosure[]>();
  (config.custom_closures || []).forEach((c) => {
    if (!c.date) return;
    const list = closuresByDate.get(c.date) || [];
    list.push(c);
    closuresByDate.set(c.date, list);
  });

  let workingDays = 0;
  let workingHalfDays = 0;
  let closureHalfDays = 0;
  let vacationDaysSkipped = 0;
  const autoHolidaysHit: PublicHolidayItem[] = [];

  const days = eachDayOfInterval({ start, end });
  for (const day of days) {
    const dateStr = format(day, 'yyyy-MM-dd');

    // 1. Hors périodes scolaires -> vacances
    if (!isDateInSchoolPeriods(dateStr, config.periods || [])) {
      vacationDaysSkipped += 1;
      continue;
    }

    // 2. Demi-journées théoriques selon 4 ou 4,5 jours
    const dow = getDay(day); // 0=Dim, 1=Lun, 2=Mar, 3=Mer, 4=Jeu, 5=Ven, 6=Sam
    let hasAM = false;
    let hasPM = false;

    if (dow === 1 || dow === 2 || dow === 4 || dow === 5) {
      hasAM = true;
      hasPM = true;
    } else if (config.week_days === 4.5) {
      if (config.half_day_slot === 'wednesday_am' && dow === 3) {
        hasAM = true;
      } else if (config.half_day_slot === 'saturday_am' && dow === 6) {
        hasAM = true;
      }
    }

    if (!hasAM && !hasPM) {
      continue;
    }

    // 3. Jours fériés automatiques
    const holidayLabel = autoHolidaysMap.get(dateStr);
    if (holidayLabel) {
      autoHolidaysHit.push({ date: dateStr, label: holidayLabel });
      continue;
    }

    // 4. Fermetures manuelles (pont, grève, fermeture exceptionnelle)
    const closures = closuresByDate.get(dateStr) || [];
    for (const cl of closures) {
      if (cl.scope === 'full') {
        if (hasAM) {
          hasAM = false;
          closureHalfDays += 1;
        }
        if (hasPM) {
          hasPM = false;
          closureHalfDays += 1;
        }
      } else if (cl.scope === 'AM' && hasAM) {
        hasAM = false;
        closureHalfDays += 1;
      } else if (cl.scope === 'PM' && hasPM) {
        hasPM = false;
        closureHalfDays += 1;
      }
    }

    const dayHalfDays = (hasAM ? 1 : 0) + (hasPM ? 1 : 0);
    if (dayHalfDays > 0) {
      workingDays += 1;
      workingHalfDays += dayHalfDays;
    }
  }

  return {
    workingDays,
    workingHalfDays,
    autoHolidaysHit,
    closureHalfDays,
    vacationDaysSkipped,
  };
}

/**
 * Découpe les 5 périodes de classe en segments (Période, Mois) avec dates exactes et demi-journées ouvrées.
 */
export function buildPeriodMonthSegments(config: AbsenceConfig): PeriodMonthSegment[] {
  const segments: PeriodMonthSegment[] = [];
  const sortedPeriods = [...(config.periods || [])]
    .filter((p) => p.start && p.end && p.start <= p.end)
    .sort((a, b) => a.period - b.period);

  for (const p of sortedPeriods) {
    const pStart = parseISO(p.start);
    const pEnd = parseISO(p.end);
    if (!isValid(pStart) || !isValid(pEnd)) continue;

    let cursor = startOfMonth(pStart);
    const lastMonth = startOfMonth(pEnd);

    while (cursor <= lastMonth) {
      const mStart = startOfMonth(cursor);
      const mEnd = endOfMonth(cursor);

      const segStart = format(pStart > mStart ? pStart : mStart, 'yyyy-MM-dd');
      const segEnd = format(pEnd < mEnd ? pEnd : mEnd, 'yyyy-MM-dd');

      if (segStart <= segEnd) {
        const monthKey = format(cursor, 'yyyy-MM');
        const rawMonthName = format(cursor, 'MMMM yyyy', { locale: fr });
        const monthLabel = rawMonthName.charAt(0).toUpperCase() + rawMonthName.slice(1);
        const rawShortMonth = format(cursor, 'MMM', { locale: fr }).replace('.', '');
        const shortMonth = rawShortMonth.charAt(0).toUpperCase() + rawShortMonth.slice(1);

        const counts = countWorkingHalfDays(segStart, segEnd, config);

        if (counts.workingHalfDays > 0) {
          segments.push({
            key: `${monthKey}_P${p.period}`,
            period: p.period,
            periodLabel: p.label || `Période ${p.period}`,
            monthKey,
            monthLabel,
            shortLabel: `${shortMonth}. (P${p.period})`,
            startDate: segStart,
            endDate: segEnd,
            workingDays: counts.workingDays,
            workingHalfDays: counts.workingHalfDays,
          });
        }
      }

      // Mois suivant
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    }
  }

  return segments;
}

/**
 * Retourne l'effectif à utiliser pour un segment donné (snapshot figé s'il existe, sinon effectif actif courant).
 */
export function getSegmentHeadcount(
  segmentKey: string,
  config: AbsenceConfig,
  activeStudentsCount: number
): number {
  const saved = config.segment_headcounts?.[segmentKey];
  if (typeof saved === 'number' && Number.isFinite(saved) && saved > 0) {
    return saved;
  }
  return Math.max(0, activeStudentsCount);
}

/**
 * Calcule les statistiques complètes d'un segment (Période, Mois).
 */
export function computeSegmentStats(
  segment: PeriodMonthSegment,
  records: StudentAbsenceRecord[],
  config: AbsenceConfig,
  activeStudentsCount: number
): ComputedPeriodStats {
  const segmentRecords = records.filter(
    (r) =>
      r.school_year === config.school_year &&
      Number(r.period) === segment.period &&
      r.month_key === segment.monthKey
  );

  const headcount = getSegmentHeadcount(segment.key, config, activeStudentsCount);
  const possiblePresences = headcount * segment.workingHalfDays;

  const absentHalfDays = segmentRecords.reduce((sum, r) => sum + (Number(r.absent_half_days) || 0), 0);
  const justifiedHalfDays = segmentRecords.reduce((sum, r) => sum + (Number(r.justified_half_days) || 0), 0);
  const unjustifiedHalfDays = Math.max(0, absentHalfDays - justifiedHalfDays);

  const absenceRate =
    possiblePresences > 0 ? Math.round((absentHalfDays / possiblePresences) * 10000) / 100 : 0;

  return {
    key: segment.key,
    label: `${segment.monthLabel} · P${segment.period}`,
    startDate: segment.startDate,
    endDate: segment.endDate,
    workingDays: segment.workingDays,
    workingHalfDays: segment.workingHalfDays,
    headcount,
    possiblePresences,
    absentHalfDays,
    justifiedHalfDays,
    unjustifiedHalfDays,
    absenceRate,
    hasData: segmentRecords.length > 0,
  };
}

/**
 * Pour une période donnée, décide quels enregistrements utiliser sans double comptage :
 * si des saisies mensuelles existent sur la période, on utilise les segments mensuels ;
 * sinon on utilise l'éventuelle saisie globale ('ALL').
 */
function getEffectiveRecordsForPeriod(
  period: number,
  schoolYear: string,
  records: StudentAbsenceRecord[]
): { mode: 'monthly' | 'all'; rows: StudentAbsenceRecord[] } {
  const periodRows = records.filter(
    (r) => r.school_year === schoolYear && Number(r.period) === period
  );
  const monthlyRows = periodRows.filter((r) => r.month_key !== 'ALL');
  if (monthlyRows.length > 0) {
    return { mode: 'monthly', rows: monthlyRows };
  }
  return { mode: 'all', rows: periodRows.filter((r) => r.month_key === 'ALL') };
}

/**
 * Calcule les statistiques agrégées par période (P1 à P5).
 */
export function computeStatsByPeriod(
  config: AbsenceConfig,
  records: StudentAbsenceRecord[],
  activeStudentsCount: number
): ComputedPeriodStats[] {
  const segments = buildPeriodMonthSegments(config);
  const sortedPeriods = [...(config.periods || [])]
    .filter((p) => p.start && p.end && p.start <= p.end)
    .sort((a, b) => a.period - b.period);

  return sortedPeriods.map((p) => {
    const pSegments = segments.filter((s) => s.period === p.period);
    const { mode, rows } = getEffectiveRecordsForPeriod(p.period, config.school_year, records);

    const periodCounts = countWorkingHalfDays(p.start, p.end, config);

    let possiblePresences = 0;
    let avgHeadcount = activeStudentsCount;

    if (pSegments.length > 0 && mode === 'monthly') {
      possiblePresences = pSegments.reduce((sum, seg) => {
        const hc = getSegmentHeadcount(seg.key, config, activeStudentsCount);
        return sum + hc * seg.workingHalfDays;
      }, 0);
      avgHeadcount =
        periodCounts.workingHalfDays > 0
          ? Math.round((possiblePresences / periodCounts.workingHalfDays) * 10) / 10
          : activeStudentsCount;
    } else {
      const globalKey = `ALL_P${p.period}`;
      avgHeadcount = getSegmentHeadcount(globalKey, config, activeStudentsCount);
      possiblePresences = avgHeadcount * periodCounts.workingHalfDays;
    }

    const absentHalfDays = rows.reduce((sum, r) => sum + (Number(r.absent_half_days) || 0), 0);
    const justifiedHalfDays = rows.reduce((sum, r) => sum + (Number(r.justified_half_days) || 0), 0);
    const unjustifiedHalfDays = Math.max(0, absentHalfDays - justifiedHalfDays);
    const absenceRate =
      possiblePresences > 0 ? Math.round((absentHalfDays / possiblePresences) * 10000) / 100 : 0;

    return {
      key: `P${p.period}`,
      label: p.label || `Période ${p.period}`,
      startDate: p.start,
      endDate: p.end,
      workingDays: periodCounts.workingDays,
      workingHalfDays: periodCounts.workingHalfDays,
      headcount: avgHeadcount,
      possiblePresences,
      absentHalfDays,
      justifiedHalfDays,
      unjustifiedHalfDays,
      absenceRate,
      hasData: rows.length > 0,
    };
  });
}

/**
 * Calcule les statistiques agrégées mois par mois (en regroupant les segments d'un même mois civil).
 */
export function computeStatsByMonth(
  config: AbsenceConfig,
  records: StudentAbsenceRecord[],
  activeStudentsCount: number
): ComputedPeriodStats[] {
  const segments = buildPeriodMonthSegments(config);
  const byMonth = new Map<string, PeriodMonthSegment[]>();

  segments.forEach((seg) => {
    const list = byMonth.get(seg.monthKey) || [];
    list.push(seg);
    byMonth.set(seg.monthKey, list);
  });

  const result: ComputedPeriodStats[] = [];
  for (const [monthKey, monthSegs] of Array.from(byMonth.entries()).sort(([a], [b]) => a.localeCompare(b))) {
    let workingDays = 0;
    let workingHalfDays = 0;
    let possiblePresences = 0;
    let absentHalfDays = 0;
    let justifiedHalfDays = 0;
    let hasData = false;

    for (const seg of monthSegs) {
      const st = computeSegmentStats(seg, records, config, activeStudentsCount);
      workingDays += st.workingDays;
      workingHalfDays += st.workingHalfDays;
      possiblePresences += st.possiblePresences;
      absentHalfDays += st.absentHalfDays;
      justifiedHalfDays += st.justifiedHalfDays;
      if (st.hasData) hasData = true;
    }

    const headcount =
      workingHalfDays > 0
        ? Math.round((possiblePresences / workingHalfDays) * 10) / 10
        : activeStudentsCount;
    const unjustifiedHalfDays = Math.max(0, absentHalfDays - justifiedHalfDays);
    const absenceRate =
      possiblePresences > 0 ? Math.round((absentHalfDays / possiblePresences) * 10000) / 100 : 0;

    result.push({
      key: monthKey,
      label: monthSegs[0].monthLabel,
      startDate: monthSegs[0].startDate,
      endDate: monthSegs[monthSegs.length - 1].endDate,
      workingDays,
      workingHalfDays,
      headcount,
      possiblePresences,
      absentHalfDays,
      justifiedHalfDays,
      unjustifiedHalfDays,
      absenceRate,
      hasData,
    });
  }

  return result;
}

/**
 * Calcule les statistiques sur une plage libre de date à date [fromDate, toDate].
 * Proratise proprement les enregistrements mensuels/périodes si la plage coupe un segment en cours.
 */
export function computeStatsForDateRange(
  fromDate: string,
  toDate: string,
  config: AbsenceConfig,
  records: StudentAbsenceRecord[],
  activeStudentsCount: number
): { summary: ComputedPeriodStats; studentSummaries: ComputedStudentAbsenceSummary[] } {
  const counts = countWorkingHalfDays(fromDate, toDate, config);
  const segments = buildPeriodMonthSegments(config);

  // Construire la liste des unités sources (segments mensuels, ou période globale si aucune saisie mensuelle)
  interface SourceUnit {
    startDate: string;
    endDate: string;
    workingHalfDays: number;
    headcount: number;
    rows: StudentAbsenceRecord[];
  }

  const units: SourceUnit[] = [];
  const periods = [...(config.periods || [])].sort((a, b) => a.period - b.period);

  for (const p of periods) {
    if (!p.start || !p.end) continue;
    const { mode, rows } = getEffectiveRecordsForPeriod(p.period, config.school_year, records);

    if (mode === 'monthly') {
      const pSegs = segments.filter((s) => s.period === p.period);
      for (const seg of pSegs) {
        units.push({
          startDate: seg.startDate,
          endDate: seg.endDate,
          workingHalfDays: seg.workingHalfDays,
          headcount: getSegmentHeadcount(seg.key, config, activeStudentsCount),
          rows: rows.filter((r) => r.month_key === seg.monthKey),
        });
      }
    } else {
      const pCounts = countWorkingHalfDays(p.start, p.end, config);
      units.push({
        startDate: p.start,
        endDate: p.end,
        workingHalfDays: pCounts.workingHalfDays,
        headcount: getSegmentHeadcount(`ALL_P${p.period}`, config, activeStudentsCount),
        rows,
      });
    }
  }

  let totalPossiblePresences = 0;
  let totalAbsent = 0;
  let totalJustified = 0;
  let isProrated = false;
  let hasData = false;

  const studentAcc = new Map<string, { absent: number; justified: number }>();

  for (const unit of units) {
    const overlapStart = fromDate > unit.startDate ? fromDate : unit.startDate;
    const overlapEnd = toDate < unit.endDate ? toDate : unit.endDate;
    if (overlapStart > overlapEnd) continue;

    const overlapCounts = countWorkingHalfDays(overlapStart, overlapEnd, config);
    if (overlapCounts.workingHalfDays <= 0 || unit.workingHalfDays <= 0) continue;

    const ratio = overlapCounts.workingHalfDays / unit.workingHalfDays;
    if (ratio < 0.999 && unit.rows.length > 0) {
      isProrated = true;
    }

    totalPossiblePresences += unit.headcount * overlapCounts.workingHalfDays;

    if (unit.rows.length > 0) hasData = true;
    for (const r of unit.rows) {
      const a = (Number(r.absent_half_days) || 0) * ratio;
      const j = (Number(r.justified_half_days) || 0) * ratio;
      totalAbsent += a;
      totalJustified += j;

      const prev = studentAcc.get(r.student_id) || { absent: 0, justified: 0 };
      studentAcc.set(r.student_id, {
        absent: prev.absent + a,
        justified: prev.justified + j,
      });
    }
  }

  // Si aucune période configurée ne chevauche la plage
  if (totalPossiblePresences === 0 && counts.workingHalfDays > 0) {
    totalPossiblePresences = activeStudentsCount * counts.workingHalfDays;
  }

  const roundedAbsent = Math.round(totalAbsent * 10) / 10;
  const roundedJustified = Math.round(totalJustified * 10) / 10;
  const roundedUnjustified = Math.max(0, Math.round((roundedAbsent - roundedJustified) * 10) / 10);
  const avgHeadcount =
    counts.workingHalfDays > 0
      ? Math.round((totalPossiblePresences / counts.workingHalfDays) * 10) / 10
      : activeStudentsCount;

  const absenceRate =
    totalPossiblePresences > 0
      ? Math.round((totalAbsent / totalPossiblePresences) * 10000) / 100
      : 0;

  return {
    summary: {
      key: `${fromDate}_${toDate}`,
      label: `Du ${formatDateFr(fromDate)} au ${formatDateFr(toDate)}`,
      startDate: fromDate,
      endDate: toDate,
      workingDays: counts.workingDays,
      workingHalfDays: counts.workingHalfDays,
      headcount: avgHeadcount,
      possiblePresences: Math.round(totalPossiblePresences),
      absentHalfDays: roundedAbsent,
      justifiedHalfDays: roundedJustified,
      unjustifiedHalfDays: roundedUnjustified,
      absenceRate,
      hasData,
      isProrated,
    },
    studentSummaries: Array.from(studentAcc.entries()).map(([studentId, vals]) => {
      const a = Math.round(vals.absent * 10) / 10;
      const j = Math.round(vals.justified * 10) / 10;
      const u = Math.max(0, Math.round((a - j) * 10) / 10);
      const rate =
        counts.workingHalfDays > 0
          ? Math.round((vals.absent / counts.workingHalfDays) * 10000) / 100
          : 0;
      return {
        studentId,
        firstName: '',
        lastName: '',
        grade: '',
        absentHalfDays: a,
        justifiedHalfDays: j,
        unjustifiedHalfDays: u,
        possibleHalfDays: counts.workingHalfDays,
        absenceRate: rate,
      };
    }),
  };
}

/**
 * Construit les stats individuelles enrichies avec les informations élèves (triées par taux décroissant).
 */
export function enrichStudentSummaries(
  rawSummaries: ComputedStudentAbsenceSummary[],
  students: Student[],
  possibleHalfDays: number
): ComputedStudentAbsenceSummary[] {
  const map = new Map<string, ComputedStudentAbsenceSummary>();
  rawSummaries.forEach((s) => map.set(s.studentId, s));

  const activeOrTracked = students.filter((st) => !st.isArchived || map.has(st.id));

  return activeOrTracked
    .map((st) => {
      const found = map.get(st.id);
      const absent = found ? found.absentHalfDays : 0;
      const justified = found ? found.justifiedHalfDays : 0;
      const unjustified = found ? found.unjustifiedHalfDays : 0;
      const denom = found?.possibleHalfDays || possibleHalfDays;
      const rate = denom > 0 ? Math.round((absent / denom) * 10000) / 100 : 0;

      return {
        studentId: st.id,
        firstName: st.firstName,
        lastName: st.lastName,
        grade: st.grade,
        absentHalfDays: absent,
        justifiedHalfDays: justified,
        unjustifiedHalfDays: unjustified,
        possibleHalfDays: denom,
        absenceRate: rate,
      };
    })
    .sort((a, b) => b.absenceRate - a.absenceRate || a.lastName.localeCompare(b.lastName));
}

export function formatDateFr(dateStr: string): string {
  if (!dateStr) return '';
  const d = parseISO(dateStr);
  if (!isValid(d)) return dateStr;
  return format(d, 'dd/MM/yyyy');
}

/**
 * Génère un tableau TSV (copiable directement dans Excel / Google Sheets / LibreOffice)
 * pour la sélection active et éventuellement le détail par élève.
 */
export function formatAbsencesAsTSV(
  title: string,
  rows: ComputedPeriodStats[],
  studentRows?: ComputedStudentAbsenceSummary[]
): string {
  const lines: string[] = [];
  lines.push(title);
  lines.push(
    [
      'Période / Mois',
      'Date début',
      'Date fin',
      'Jours ouvrés',
      'Demi-journées ouvrées',
      'Effectif',
      'Présences possibles',
      'Absences (demi-journées)',
      'Justifiées',
      'Non justifiées',
      "Taux d'absence (%)",
    ].join('\t')
  );

  rows.forEach((r) => {
    lines.push(
      [
        r.label,
        formatDateFr(r.startDate),
        formatDateFr(r.endDate),
        String(r.workingDays),
        String(r.workingHalfDays),
        String(r.headcount).replace('.', ','),
        String(r.possiblePresences),
        String(r.absentHalfDays).replace('.', ','),
        String(r.justifiedHalfDays).replace('.', ','),
        String(r.unjustifiedHalfDays).replace('.', ','),
        `${r.absenceRate.toFixed(2).replace('.', ',')}%`,
      ].join('\t')
    );
  });

  if (rows.length > 1) {
    const totalDays = rows.reduce((s, r) => s + r.workingDays, 0);
    const totalHalf = rows.reduce((s, r) => s + r.workingHalfDays, 0);
    const totalPossible = rows.reduce((s, r) => s + r.possiblePresences, 0);
    const totalAbs = Math.round(rows.reduce((s, r) => s + r.absentHalfDays, 0) * 10) / 10;
    const totalJust = Math.round(rows.reduce((s, r) => s + r.justifiedHalfDays, 0) * 10) / 10;
    const totalUnjust = Math.max(0, Math.round((totalAbs - totalJust) * 10) / 10);
    const totalRate = totalPossible > 0 ? (totalAbs / totalPossible) * 100 : 0;

    lines.push(
      [
        'TOTAL',
        formatDateFr(rows[0].startDate),
        formatDateFr(rows[rows.length - 1].endDate),
        String(totalDays),
        String(totalHalf),
        '-',
        String(totalPossible),
        String(totalAbs).replace('.', ','),
        String(totalJust).replace('.', ','),
        String(totalUnjust).replace('.', ','),
        `${totalRate.toFixed(2).replace('.', ',')}%`,
      ].join('\t')
    );
  }

  if (studentRows && studentRows.length > 0) {
    const nonZeroStudents = studentRows.filter((s) => s.absentHalfDays > 0);
    if (nonZeroStudents.length > 0) {
      lines.push('');
      lines.push('Détail par élève (élèves avec absences)');
      lines.push(
        ['Élève', 'Niveau', 'Absences (demi-journées)', 'Justifiées', 'Non justifiées', 'Présences possibles', "Taux d'absentéisme (%)"].join('\t')
      );
      nonZeroStudents.forEach((st) => {
        lines.push(
          [
            `${st.lastName} ${st.firstName}`.trim(),
            st.grade,
            String(st.absentHalfDays).replace('.', ','),
            String(st.justifiedHalfDays).replace('.', ','),
            String(st.unjustifiedHalfDays).replace('.', ','),
            String(st.possibleHalfDays),
            `${st.absenceRate.toFixed(2).replace('.', ',')}%`,
          ].join('\t')
        );
      });
    }
  }

  return lines.join('\n');
}

/**
 * Génère une synthèse textuelle lisible pour copie rapide dans un rapport ou cahier journal.
 */
export function formatAbsencesAsSummaryText(
  title: string,
  summary: ComputedPeriodStats
): string {
  return [
    `📊 ${title} (${formatDateFr(summary.startDate)} → ${formatDateFr(summary.endDate)})`,
    `• Jours de classe : ${summary.workingDays} jours (${summary.workingHalfDays} demi-journées)`,
    `• Effectif retenu : ${summary.headcount} élèves → ${summary.possiblePresences} présences possibles`,
    `• Absences relevées : ${summary.absentHalfDays} demi-journées (dont ${summary.justifiedHalfDays} justifiées, ${summary.unjustifiedHalfDays} non justifiées)`,
    `• Taux d'absence : ${summary.absenceRate.toFixed(2).replace('.', ',')} %`,
  ].join('\n');
}
