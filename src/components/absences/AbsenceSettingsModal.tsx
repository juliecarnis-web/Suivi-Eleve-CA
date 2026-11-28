import React, { useState, useEffect, useMemo } from 'react';
import { X, Save, Calendar, Plus, Trash2, CheckCircle2, RotateCcw } from 'lucide-react';
import {
  AbsenceClosure,
  AbsenceClosureScope,
  AbsenceConfig,
  AbsenceHalfDaySlot,
  AbsencePeriodConfig,
  AbsenceWeekDays,
} from '../../types';
import {
  countWorkingHalfDays,
  extractPeriodsFromUserSettings,
  formatDateFr,
  getDefaultPeriods,
  getSchoolYearPublicHolidays,
} from '../../utils/absences';

interface AbsenceSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: AbsenceConfig;
  userSettings?: any;
  onSaveConfig: (nextConfig: AbsenceConfig) => Promise<void>;
}

export default function AbsenceSettingsModal({
  isOpen,
  onClose,
  config,
  userSettings,
  onSaveConfig,
}: AbsenceSettingsModalProps) {
  const [teacherName, setTeacherName] = useState<string>(
    config.teacher_name || 'Julie Carnis-Bréart'
  );
  const [weekDays, setWeekDays] = useState<AbsenceWeekDays>(config.week_days);
  const [halfDaySlot, setHalfDaySlot] = useState<AbsenceHalfDaySlot>(config.half_day_slot);
  const [periods, setPeriods] = useState<AbsencePeriodConfig[]>(config.periods);
  const [customClosures, setCustomClosures] = useState<AbsenceClosure[]>(config.custom_closures);
  const [excludedAutoHolidays, setExcludedAutoHolidays] = useState<string[]>(
    config.excluded_auto_holidays
  );

  // Formulaire ajout fermeture exceptionnelle
  const [newClosureDate, setNewClosureDate] = useState('');
  const [newClosureLabel, setNewClosureLabel] = useState('');
  const [newClosureScope, setNewClosureScope] = useState<AbsenceClosureScope>('full');

  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (isOpen) {
      setTeacherName(config.teacher_name || 'Julie Carnis-Bréart');
      setWeekDays(config.week_days === 4.5 ? 4.5 : 4);
      setHalfDaySlot(config.half_day_slot === 'saturday_am' ? 'saturday_am' : 'wednesday_am');
      setPeriods(
        config.periods && config.periods.length > 0
          ? config.periods.map((p) => ({ ...p }))
          : getDefaultPeriods(config.school_year)
      );
      setCustomClosures([...(config.custom_closures || [])]);
      setExcludedAutoHolidays([...(config.excluded_auto_holidays || [])]);
      setSuccessMsg('');
      setErrorMsg('');
    }
  }, [isOpen, config]);

  const draftConfig: AbsenceConfig = useMemo(
    () => ({
      ...config,
      teacher_name: teacherName.trim() || 'Julie Carnis-Bréart',
      week_days: weekDays,
      half_day_slot: halfDaySlot,
      periods,
      custom_closures: customClosures,
      excluded_auto_holidays: excludedAutoHolidays,
    }),
    [config, teacherName, weekDays, halfDaySlot, periods, customClosures, excludedAutoHolidays]
  );

  const autoHolidays = useMemo(
    () => getSchoolYearPublicHolidays(config.school_year),
    [config.school_year]
  );

  const userSettingsPeriods = useMemo(
    () => extractPeriodsFromUserSettings(userSettings, config.school_year),
    [userSettings, config.school_year]
  );

  const periodPreviews = useMemo(() => {
    return periods.map((p) => ({
      period: p.period,
      ...countWorkingHalfDays(p.start, p.end, draftConfig),
    }));
  }, [periods, draftConfig]);

  const annualTotals = useMemo(() => {
    return periodPreviews.reduce(
      (acc, item) => ({
        workingDays: acc.workingDays + item.workingDays,
        workingHalfDays: acc.workingHalfDays + item.workingHalfDays,
        holidaysHit: acc.holidaysHit + item.autoHolidaysHit.length,
        closureHalfDays: acc.closureHalfDays + item.closureHalfDays,
      }),
      { workingDays: 0, workingHalfDays: 0, holidaysHit: 0, closureHalfDays: 0 }
    );
  }, [periodPreviews]);

  if (!isOpen) return null;

  const handlePeriodChange = (
    idx: number,
    field: 'label' | 'start' | 'end',
    value: string
  ) => {
    setPeriods((prev) =>
      prev.map((p, i) => (i === idx ? { ...p, [field]: value } : p))
    );
  };

  const handleToggleAutoHoliday = (dateStr: string) => {
    setExcludedAutoHolidays((prev) =>
      prev.includes(dateStr) ? prev.filter((d) => d !== dateStr) : [...prev, dateStr]
    );
  };

  const handleAddClosure = () => {
    if (!newClosureDate) {
      setErrorMsg('Veuillez choisir une date pour la fermeture exceptionnelle.');
      return;
    }
    setErrorMsg('');
    const next: AbsenceClosure = {
      id: `cl_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      date: newClosureDate,
      label: newClosureLabel.trim() || 'Fermeture exceptionnelle',
      scope: newClosureScope,
    };
    setCustomClosures((prev) =>
      [...prev, next].sort((a, b) => a.date.localeCompare(b.date))
    );
    setNewClosureDate('');
    setNewClosureLabel('');
    setNewClosureScope('full');
  };

  const handleRemoveClosure = (id: string) => {
    setCustomClosures((prev) => prev.filter((c) => c.id !== id));
  };

  const handleImportFromUserSettings = () => {
    if (!userSettingsPeriods) return;
    setPeriods(userSettingsPeriods);
    setSuccessMsg('Périodes copiées en lecture seule depuis vos réglages existants.');
    setTimeout(() => setSuccessMsg(''), 3000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const invalidPeriod = periods.find((p) => !p.start || !p.end || p.start > p.end);
    if (invalidPeriod) {
      setErrorMsg(
        `Les dates de la ${invalidPeriod.label || `Période ${invalidPeriod.period}`} sont invalides (début doit précéder la fin).`
      );
      return;
    }

    setErrorMsg('');
    setSaving(true);
    try {
      await onSaveConfig(draftConfig);
      setSuccessMsg('Calendrier scolaire des absences enregistré.');
      setTimeout(() => {
        setSuccessMsg('');
        onClose();
      }, 800);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Erreur lors de la sauvegarde.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-5 bg-indigo-700 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <Calendar className="w-5 h-5 text-indigo-200" />
            <div>
              <h3 className="font-bold text-base">
                Calendrier scolaire de la classe ({config.school_year})
              </h3>
              <p className="text-xs text-indigo-100 mt-0.5">
                Paramétrage isolé pour le calcul des présences possibles (sans impact sur user_settings).
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-indigo-200 hover:text-white transition p-1 rounded-lg hover:bg-indigo-600/50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6 overflow-y-auto">
          {errorMsg && (
            <div className="bg-rose-50 border border-rose-200 text-rose-700 px-4 py-2.5 rounded-lg text-xs font-semibold">
              {errorMsg}
            </div>
          )}

          {successMsg && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-2.5 rounded-lg text-xs font-semibold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              {successMsg}
            </div>
          )}

          {/* 0. Enseignant titulaire */}
          <section className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h4 className="text-sm font-bold text-slate-800">
                Enseignant(e) titulaire de la classe
              </h4>
              <p className="text-xs text-slate-500">
                Affiché dans l’en-tête et la synthèse des bilans PDF exportés.
              </p>
            </div>
            <input
              type="text"
              value={teacherName}
              onChange={(e) => setTeacherName(e.target.value)}
              placeholder="Nom du titulaire"
              className="px-3.5 py-2 text-xs font-semibold border border-slate-300 rounded-lg bg-white text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none w-full sm:w-64"
            />
          </section>

          <hr className="border-slate-200" />

          {/* 1. Rythme hebdomadaire */}
          <section className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-bold text-slate-800">
                  Rythme hebdomadaire de l’école
                </h4>
                <p className="text-xs text-slate-500">
                  Correspond aux jours d’ouverture de la classe pour les élèves (indépendant de votre temps partiel).
                </p>
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={
                    weekDays === 4
                      ? '4'
                      : halfDaySlot === 'saturday_am'
                        ? '4.5_saturday_am'
                        : '4.5_wednesday_am'
                  }
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === '4') {
                      setWeekDays(4);
                    } else if (val === '4.5_saturday_am') {
                      setWeekDays(4.5);
                      setHalfDaySlot('saturday_am');
                    } else {
                      setWeekDays(4.5);
                      setHalfDaySlot('wednesday_am');
                    }
                  }}
                  className="px-3.5 py-2 text-xs font-semibold border border-slate-300 rounded-lg bg-white text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer"
                >
                  <option value="4">4 jours (Lundi, Mardi, Jeudi, Vendredi)</option>
                  <option value="4.5_wednesday_am">4,5 jours (avec Mercredi matin)</option>
                  <option value="4.5_saturday_am">4,5 jours (avec Samedi matin)</option>
                </select>
              </div>
            </div>
          </section>

          <hr className="border-slate-200" />

          {/* 2. Les 5 périodes de classe */}
          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h4 className="text-sm font-bold text-slate-800">
                  Les 5 périodes de classe
                </h4>
                <p className="text-xs text-slate-500">
                  Tout jour situé en dehors de ces bornes est automatiquement exclu (vacances scolaires).
                </p>
              </div>

              <div className="flex items-center gap-2">
                {userSettingsPeriods && (
                  <button
                    type="button"
                    onClick={handleImportFromUserSettings}
                    className="px-3 py-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition whitespace-nowrap shrink-0"
                  >
                    Copier depuis user_settings
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setPeriods(getDefaultPeriods(config.school_year))}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 border border-slate-200 rounded-lg transition whitespace-nowrap shrink-0"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Réinitialiser
                </button>
              </div>
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-700">
                    <th className="p-2.5">Période</th>
                    <th className="p-2.5">Date de début</th>
                    <th className="p-2.5">Date de fin</th>
                    <th className="p-2.5 text-right">Jours ouvrés</th>
                    <th className="p-2.5 text-right">Demi-journées</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-sm">
                  {periods.map((p, idx) => {
                    const preview = periodPreviews[idx];
                    return (
                      <tr key={p.period} className="hover:bg-slate-50/70">
                        <td className="p-2">
                          <input
                            type="text"
                            value={p.label}
                            onChange={(e) => handlePeriodChange(idx, 'label', e.target.value)}
                            className="w-32 px-2.5 py-1.5 border border-slate-300 rounded-md text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="date"
                            value={p.start}
                            onChange={(e) => handlePeriodChange(idx, 'start', e.target.value)}
                            className="px-2.5 py-1.5 border border-slate-300 rounded-md text-xs tabular-nums text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="date"
                            value={p.end}
                            onChange={(e) => handlePeriodChange(idx, 'end', e.target.value)}
                            className="px-2.5 py-1.5 border border-slate-300 rounded-md text-xs tabular-nums text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none"
                          />
                        </td>
                        <td className="p-2.5 text-right font-mono tabular-nums text-xs font-semibold text-slate-700">
                          {preview?.workingDays ?? 0} j
                        </td>
                        <td className="p-2.5 text-right font-mono tabular-nums text-xs font-bold text-indigo-700">
                          {preview?.workingHalfDays ?? 0} ½j
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <hr className="border-slate-200" />

          {/* 3. Jours fériés automatiques & Fermetures manuelles */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <section className="space-y-3">
              <div>
                <h4 className="text-sm font-bold text-slate-800">
                  Jours fériés automatiques
                </h4>
                <p className="text-xs text-slate-500">
                  Déduits automatiquement s’ils tombent sur un jour de classe. Décochez uniquement en cas de journée travaillée.
                </p>
              </div>
              <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-52 overflow-y-auto">
                {autoHolidays.map((h) => {
                  const isExcluded = excludedAutoHolidays.includes(h.date);
                  return (
                    <label
                      key={h.date}
                      className="flex items-center justify-between px-3 py-2 text-xs hover:bg-slate-50 cursor-pointer"
                    >
                      <span className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={!isExcluded}
                          onChange={() => handleToggleAutoHoliday(h.date)}
                          className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className={isExcluded ? 'line-through text-slate-400' : 'text-slate-700 font-medium'}>
                          {h.label}
                        </span>
                      </span>
                      <span className="font-mono tabular-nums text-slate-500">
                        {formatDateFr(h.date)}
                      </span>
                    </label>
                  );
                })}
              </div>
            </section>

            <section className="space-y-3">
              <div>
                <h4 className="text-sm font-bold text-slate-800">
                  Fermetures exceptionnelles (pont, grève...)
                </h4>
                <p className="text-xs text-slate-500">
                  Ajoutez toute journée ou demi-journée chômée supplémentaire.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="date"
                  value={newClosureDate}
                  onChange={(e) => setNewClosureDate(e.target.value)}
                  className="px-2.5 py-1.5 border border-slate-300 rounded-md text-xs tabular-nums focus:ring-2 focus:ring-indigo-500 outline-none"
                />
                <input
                  type="text"
                  value={newClosureLabel}
                  onChange={(e) => setNewClosureLabel(e.target.value)}
                  placeholder="Motif (ex. Pont, Grève)"
                  className="flex-1 min-w-[130px] px-2.5 py-1.5 border border-slate-300 rounded-md text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                />
                <select
                  value={newClosureScope}
                  onChange={(e) => setNewClosureScope(e.target.value as AbsenceClosureScope)}
                  className="px-2.5 py-1.5 border border-slate-300 rounded-md text-xs bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                >
                  <option value="full">Journée (2 ½j)</option>
                  <option value="AM">Matin (1 ½j)</option>
                  <option value="PM">Aprèm (1 ½j)</option>
                </select>
                <button
                  type="button"
                  onClick={handleAddClosure}
                  className="flex items-center gap-1 px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded-md transition whitespace-nowrap shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Ajouter
                </button>
              </div>

              <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-40 overflow-y-auto">
                {customClosures.length === 0 ? (
                  <div className="px-3 py-4 text-center text-xs text-slate-400">
                    Aucune fermeture exceptionnelle enregistrée.
                  </div>
                ) : (
                  customClosures.map((cl) => (
                    <div
                      key={cl.id}
                      className="flex items-center justify-between px-3 py-2 text-xs hover:bg-slate-50"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-mono tabular-nums font-semibold text-slate-700 shrink-0">
                          {formatDateFr(cl.date)}
                        </span>
                        <span className="text-slate-400">·</span>
                        <span className="text-slate-700 truncate">{cl.label}</span>
                        <span className="text-slate-400">·</span>
                        <span className="text-slate-500 shrink-0">
                          {cl.scope === 'full' ? 'Journée' : cl.scope === 'AM' ? 'Matin' : 'Après-midi'}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveClosure(cl.id)}
                        className="text-slate-400 hover:text-rose-600 p-1 rounded transition"
                        title="Supprimer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>

          {/* Footer synthèse + validation */}
          <div className="pt-4 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="text-xs text-slate-600 flex flex-wrap items-center gap-2 tabular-nums">
              <span>
                Total annuel : <strong className="text-slate-900">{annualTotals.workingDays} jours</strong> ({annualTotals.workingHalfDays} ½j)
              </span>
              <span className="text-slate-300">·</span>
              <span>{annualTotals.holidaysHit} férié(s) déduit(s)</span>
              {annualTotals.closureHalfDays > 0 && (
                <>
                  <span className="text-slate-300">·</span>
                  <span>{annualTotals.closureHalfDays} ½j fermée(s) manuellement</span>
                </>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 shrink-0">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-2 px-5 py-2 text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg shadow transition disabled:opacity-50 whitespace-nowrap"
              >
                <Save className="w-4 h-4" />
                {saving ? 'Enregistrement...' : 'Enregistrer le calendrier'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
