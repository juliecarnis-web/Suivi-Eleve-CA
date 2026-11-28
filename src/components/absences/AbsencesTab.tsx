import React, { useState, useMemo, useEffect } from 'react';
import {
  CalendarCheck,
  Sliders,
  Lock,
  Unlock,
  BarChart2,
  ClipboardList,
  LayoutGrid,
} from 'lucide-react';
import { AbsenceConfig, Student, StudentAbsenceRecord } from '../../types';
import { createDefaultAbsenceConfig, getDefaultSchoolYear } from '../../utils/absences';
import AbsenceSettingsModal from './AbsenceSettingsModal';
import AbsenceSaisieGrid from './AbsenceSaisieGrid';
import AbsenceCharts from './AbsenceCharts';

interface AbsencesTabProps {
  students: Student[];
  absenceConfigs: AbsenceConfig[];
  studentAbsences: StudentAbsenceRecord[];
  userSettings?: any;
  isEditMode: boolean;
  handleToggleEditMode?: () => void;
  onSaveAbsenceConfig: (config: AbsenceConfig) => Promise<void>;
  onSaveAbsenceSegment: (payload: {
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

export default function AbsencesTab({
  students,
  absenceConfigs,
  studentAbsences,
  userSettings,
  isEditMode,
  handleToggleEditMode,
  onSaveAbsenceConfig,
  onSaveAbsenceSegment,
}: AbsencesTabProps) {
  const defaultYear = useMemo(() => {
    const rawStart = userSettings?.school_year_start;
    if (typeof rawStart === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(rawStart)) {
      const parsed = new Date(`${rawStart}T00:00:00`);
      if (!isNaN(parsed.getTime())) {
        return getDefaultSchoolYear(parsed);
      }
    }
    return getDefaultSchoolYear();
  }, [userSettings?.school_year_start]);

  const availableYears = useMemo(() => {
    const set = new Set<string>([defaultYear]);
    absenceConfigs.forEach((c) => {
      if (c.school_year) set.add(c.school_year);
    });
    studentAbsences.forEach((a) => {
      if (a.school_year) set.add(a.school_year);
    });
    return Array.from(set).sort().reverse();
  }, [defaultYear, absenceConfigs, studentAbsences]);

  const [selectedSchoolYear, setSelectedSchoolYear] = useState<string>(defaultYear);

  useEffect(() => {
    if (!availableYears.includes(selectedSchoolYear)) {
      setSelectedSchoolYear(defaultYear);
    }
  }, [availableYears, selectedSchoolYear, defaultYear]);

  const [subView, setSubView] = useState<'all' | 'saisie' | 'analytics'>('all');
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);

  const activeConfig: AbsenceConfig = useMemo(() => {
    const found = absenceConfigs.find((c) => c.school_year === selectedSchoolYear);
    if (found && found.periods && found.periods.length > 0) {
      return found;
    }
    const base = createDefaultAbsenceConfig(selectedSchoolYear);
    return found
      ? {
          ...base,
          ...found,
          periods: found.periods.length > 0 ? found.periods : base.periods,
        }
      : base;
  }, [absenceConfigs, selectedSchoolYear]);

  const isConfigPersisted = useMemo(
    () => absenceConfigs.some((c) => c.school_year === selectedSchoolYear),
    [absenceConfigs, selectedSchoolYear]
  );

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 py-6 space-y-6 overflow-y-auto flex-1">
      {/* En-tête du module Absences */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-sm shrink-0">
            <CalendarCheck className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-800">
              Suivi & Taux d’Absence des Élèves
            </h1>
            <p className="text-xs text-slate-500">
              Saisie mensuelle ou par période · Calcul automatique hors vacances, fériés et jours non travaillés ({activeConfig.week_days} j/sem.).
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto">
          {/* Année scolaire (uniquement l'année courante + années enregistrées) */}
          <div className="flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold">
            <span className="text-slate-500">Année :</span>
            {availableYears.length > 1 ? (
              <select
                value={selectedSchoolYear}
                onChange={(e) => setSelectedSchoolYear(e.target.value)}
                className="bg-transparent font-bold text-slate-800 outline-none cursor-pointer"
              >
                {availableYears.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            ) : (
              <span className="font-bold text-slate-800 tabular-nums">{selectedSchoolYear}</span>
            )}
          </div>

          {/* Bouton Activer Saisie */}
          {handleToggleEditMode && (
            <button
              type="button"
              onClick={handleToggleEditMode}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition border shadow-sm whitespace-nowrap shrink-0 ${
                isEditMode
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100'
                  : 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100'
              }`}
            >
              {isEditMode ? (
                <Unlock className="w-3.5 h-3.5 text-emerald-600" />
              ) : (
                <Lock className="w-3.5 h-3.5 text-amber-600" />
              )}
              {isEditMode ? 'Mode Saisie : Actif' : 'Activer Saisie'}
            </button>
          )}

          {/* Paramétrage calendrier */}
          <button
            type="button"
            onClick={() => setIsSettingsOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg border border-slate-200 transition whitespace-nowrap shrink-0"
          >
            <Sliders className="w-3.5 h-3.5 text-slate-500" />
            Calendrier ({isConfigPersisted ? 'configuré' : 'par défaut'})
          </button>
        </div>
      </div>

      {/* Barre d'onglets claire (Saisie / Graphiques Classe & Élèves) */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-1">
        <div className="flex gap-2 overflow-x-auto">
          <button
            type="button"
            onClick={() => setSubView('all')}
            className={`flex items-center gap-2 px-4 py-2 rounded-t-xl text-xs font-bold transition border-b-2 whitespace-nowrap shrink-0 ${
              subView === 'all'
                ? 'border-indigo-600 text-indigo-700 bg-indigo-50/50'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <LayoutGrid className="w-4 h-4" />
            Vue complète (Graphiques & Saisie)
          </button>
          <button
            type="button"
            onClick={() => setSubView('analytics')}
            className={`flex items-center gap-2 px-4 py-2 rounded-t-xl text-xs font-bold transition border-b-2 whitespace-nowrap shrink-0 ${
              subView === 'analytics'
                ? 'border-indigo-600 text-indigo-700 bg-indigo-50/50'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <BarChart2 className="w-4 h-4" />
            Graphiques Classe / Élèves & Copier-coller
          </button>
          <button
            type="button"
            onClick={() => setSubView('saisie')}
            className={`flex items-center gap-2 px-4 py-2 rounded-t-xl text-xs font-bold transition border-b-2 whitespace-nowrap shrink-0 ${
              subView === 'saisie'
                ? 'border-indigo-600 text-indigo-700 bg-indigo-50/50'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <ClipboardList className="w-4 h-4" />
            Saisie des absences
          </button>
        </div>
      </div>

      {/* Graphiques Classe / Élèves & Copier-Coller */}
      {(subView === 'all' || subView === 'analytics') && (
        <AbsenceCharts
          students={students}
          config={activeConfig}
          records={studentAbsences}
          onGoToSaisie={() => setSubView('saisie')}
        />
      )}

      {/* Grille de Saisie */}
      {(subView === 'all' || subView === 'saisie') && (
        <AbsenceSaisieGrid
          students={students}
          config={activeConfig}
          records={studentAbsences}
          isEditMode={isEditMode}
          handleToggleEditMode={handleToggleEditMode}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onSaveSegmentRecords={onSaveAbsenceSegment}
        />
      )}

      {/* Modale de paramétrage du calendrier */}
      <AbsenceSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        config={activeConfig}
        userSettings={userSettings}
        onSaveConfig={onSaveAbsenceConfig}
      />
    </div>
  );
}
